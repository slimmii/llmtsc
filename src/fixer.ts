import * as path from "path";
import type * as TS from "typescript";
import { AnswerCache } from "./cache";
import { loadConfig, type LlmtscConfig } from "./config";
import { createLogger, type Logger } from "./log";
import { PROMPT_VERSION, SYSTEM_PROMPT, applyEdits, buildUserPrompt, parseEdits, type PromptDiagnostic } from "./prompt";
import { createProvider, type LlmProvider } from "./providers";

export interface FixerOptions {
  /** Project directory. Defaults to process.cwd(). */
  cwd?: string;
  /** Path to tsconfig.json. Defaults to the nearest tsconfig.json from cwd. */
  tsconfig?: string;
  /** Compiler option overrides (already parsed, e.g. from ts.parseCommandLine). */
  compilerOptions?: TS.CompilerOptions;
  /** Explicit root files; when set no tsconfig is used (like `tsc a.ts b.ts`). */
  files?: string[];
  /** Override environment based configuration. */
  config?: Partial<LlmtscConfig>;
  /** TypeScript module to use. Defaults to the project's own `typescript`. */
  typescript?: typeof TS;
  /** Called after a run whose fixed output differs from the previous run (dev-server integrations use this to reload). */
  onFixesChanged?: (files: string[]) => void;
  logger?: Logger;
}

export interface FixReport {
  passes: number;
  initialErrorCount: number;
  /** Diagnostics left after fixing (file diagnostics only). */
  remaining: TS.Diagnostic[];
  /** Absolute paths of files whose compiled text differs from what is on disk. */
  fixedFiles: string[];
  llmCalls: number;
  cacheHits: number;
  durationMs: number;
}

interface Project {
  configPath: string;
  options: TS.CompilerOptions;
  rootNames: string[];
  configDiagnostics: TS.Diagnostic[];
  program?: TS.Program;
}

export const normalizePath = (f: string) => path.resolve(f).replace(/\\/g, "/");

/**
 * Prefer the project's own TypeScript (so diagnostics match its version), but only if it still ships
 * the classic compiler API. TypeScript 7 (the native port) does not, so fall back to our bundled 5.x/6.x.
 */
export function loadTypeScript(cwd: string): typeof TS {
  try {
    const ts = require(require.resolve("typescript", { paths: [cwd] }));
    if (typeof ts.createProgram === "function" && typeof ts.parseCommandLine === "function") return ts;
  } catch {
    // not installed in the project
  }
  return require("typescript");
}

/**
 * Type-checks a project, asks an LLM to repair every file that has errors, and keeps the repaired
 * text in memory. Nothing is ever written back to the source files.
 */
export class LlmFixer {
  readonly ts: typeof TS;
  readonly cwd: string;
  readonly config: LlmtscConfig;
  readonly log: Logger;

  /** normalized path -> repaired text (only for files that differ from disk). */
  private fixed = new Map<string, string>();
  /** normalized path -> text read from disk during the last run, for fixable project files. */
  private diskTexts = new Map<string, string>();
  private sourceFileCache = new Map<string, { text: string; sf: TS.SourceFile }>();
  private projects: Project[] = [];
  private provider?: LlmProvider;
  private cache: AnswerCache;
  private dirty = true;
  private current?: Promise<unknown>;
  private lastReport?: FixReport;
  private unknownFilesChecked = new Set<string>();

  constructor(private opts: FixerOptions = {}) {
    this.cwd = path.resolve(opts.cwd ?? process.cwd());
    this.ts = opts.typescript ?? loadTypeScript(this.cwd);
    this.config = { ...loadConfig(this.cwd), ...opts.config };
    this.log = opts.logger ?? createLogger(this.config.logLevel);
    this.cache = new AnswerCache(this.config.cacheDir);
  }

  // ---------------------------------------------------------------------------------------------
  // Public API used by the integrations
  // ---------------------------------------------------------------------------------------------

  /**
   * Returns the repaired text for a file, or undefined when the file needs no repair (or is not
   * part of the TypeScript project). Pass the text the bundler currently sees, so edits made in
   * watch mode trigger a new fix round.
   */
  async getFixedText(fileName: string, currentText?: string): Promise<string | undefined> {
    const key = normalizePath(fileName);
    const known = this.diskTexts.get(key);
    if (currentText !== undefined && known !== undefined && known !== currentText) {
      this.dirty = true;
    } else if (known === undefined && this.lastReport && !this.unknownFilesChecked.has(key)) {
      // New file (or one outside the project): re-scan once so newly created files are picked up.
      this.unknownFilesChecked.add(key);
      this.dirty = true;
    }
    await this.ensureFresh();
    const fixed = this.fixed.get(key);
    // Only hand out a fix that was computed from the exact text the caller has.
    if (fixed !== undefined && (currentText === undefined || this.diskTexts.get(key) === currentText)) return fixed;
    return undefined;
  }

  /** Mark the project as changed; the next getFixedText()/ensureFresh() re-runs the fixer. */
  invalidate(): void {
    this.dirty = true;
  }

  /** Run (or wait for) a fix round if anything changed since the last one. */
  async ensureFresh(): Promise<FixReport | undefined> {
    while (this.dirty || this.current) {
      if (this.current) {
        await this.current.catch(() => undefined);
        continue;
      }
      this.dirty = false;
      this.current = this.run()
        .catch((e) => this.log.error(`fixing failed, compiling without repairs: ${e?.stack ?? e}`))
        .finally(() => (this.current = undefined));
    }
    return this.lastReport;
  }

  /** All files currently repaired, as absolute path -> repaired text. */
  getFixes(): ReadonlyMap<string, string> {
    return this.fixed;
  }

  getDiskText(fileName: string): string | undefined {
    return this.diskTexts.get(normalizePath(fileName));
  }

  /** The programs of the last run (built on the repaired texts). Used by the CLI to emit. */
  getPrograms(): TS.Program[] {
    return this.projects.map((p) => p.program!).filter(Boolean);
  }

  getConfigDiagnostics(): TS.Diagnostic[] {
    return this.projects.flatMap((p) => p.configDiagnostics);
  }

  // ---------------------------------------------------------------------------------------------
  // The fix loop
  // ---------------------------------------------------------------------------------------------

  async run(): Promise<FixReport> {
    const started = Date.now();
    const ts = this.ts;
    this.projects = this.loadProjects();
    this.diskTexts.clear();
    const overlay = new Map<string, string>();
    const stats = { llmCalls: 0, cacheHits: 0 };

    let diags = this.check(overlay);
    const initialErrorCount = diags.length;
    let passes = 0;
    const stuck = new Set<string>();

    if (diags.length && !this.config.disabled) {
      this.log.info(`${diags.length} TypeScript error(s) in ${groupByFile(diags).size} file(s), asking ${this.config.llm.provider}/${this.config.llm.model} to repair`);
    }

    while (!this.config.disabled && diags.length && passes < this.config.maxPasses) {
      const byFile = groupByFile(diags);
      const targets = [...byFile.keys()].filter((f) => !stuck.has(f) && this.isFixable(f));
      if (!targets.length) break;
      passes++;

      const before = new Map(targets.map((f) => [f, overlay.get(f)]));
      const candidates = await mapLimit(targets, this.config.concurrency, (f) =>
        this.fixFile(f, overlay.get(f) ?? this.diskTexts.get(f)!, byFile.get(f)!, stats).catch((e) => {
          this.log.error(`${this.rel(f)}: LLM request failed: ${e?.message ?? e}`);
          return undefined;
        }),
      );

      const changed: string[] = [];
      targets.forEach((f, i) => {
        const text = candidates[i];
        if (text !== undefined && text !== (overlay.get(f) ?? this.diskTexts.get(f))) {
          overlay.set(f, text);
          changed.push(f);
        } else {
          stuck.add(f);
        }
      });
      if (!changed.length) break;

      const after = this.check(overlay);
      // Keep a file's repair if it resolved at least one of that file's errors without breaking its syntax.
      // (The total count may legitimately go up: fixing a bad import often reveals errors it was hiding.)
      const afterByFile = groupByFile(after);
      let reverted = 0;
      for (const f of changed) {
        const old = byFile.get(f)!;
        const now = afterByFile.get(f) ?? [];
        const remaining = new Set(now.map(signature));
        const resolved = old.filter((d) => !remaining.has(signature(d))).length;
        const syntaxErrors = (list: TS.Diagnostic[]) => list.filter((d) => d.code < 2000).length;
        if (resolved === 0 || syntaxErrors(now) > syntaxErrors(old)) {
          const prev = before.get(f);
          if (prev === undefined) overlay.delete(f);
          else overlay.set(f, prev);
          stuck.add(f);
          reverted++;
          this.log.debug(`${this.rel(f)}: repair resolved nothing or broke syntax, discarded`);
        }
      }
      diags = reverted ? this.check(overlay) : after;
    }

    const previous = this.fixed;
    this.fixed = new Map([...overlay].filter(([f, text]) => this.diskTexts.get(f) !== text));
    const report: FixReport = {
      passes,
      initialErrorCount,
      remaining: diags,
      fixedFiles: [...this.fixed.keys()],
      durationMs: Date.now() - started,
      ...stats,
    };
    this.lastReport = report;

    if (initialErrorCount && !this.config.disabled) {
      this.log.info(
        `repaired ${report.fixedFiles.length} file(s), ${diags.length ? diags.length : "no"} error(s) left ` +
          `(${stats.llmCalls} LLM call(s), ${stats.cacheHits} cached, ${(report.durationMs / 1000).toFixed(1)}s)`,
      );
    }
    if (diags.length) {
      this.log.info(`${diags.length} error(s) could not be repaired:\n${this.format(diags)}`);
    }

    const changedFiles = new Set([...previous.keys(), ...this.fixed.keys()]);
    const changes = [...changedFiles].filter((f) => previous.get(f) !== this.fixed.get(f));
    if (changes.length && this.opts.onFixesChanged) this.opts.onFixesChanged(changes);
    return report;
  }

  private async fixFile(
    file: string,
    text: string,
    diagnostics: TS.Diagnostic[],
    stats: { llmCalls: number; cacheHits: number },
  ): Promise<string | undefined> {
    const rel = this.rel(file);
    const promptDiags = diagnostics.map((d) => this.toPromptDiagnostic(d));
    const user = buildUserPrompt(rel, text, promptDiags);
    const { provider, model, baseUrl, command } = this.config.llm;
    const key = AnswerCache.key(PROMPT_VERSION, provider, model, baseUrl ?? "", command ?? "", user);

    let answer = this.cache.get(key);
    if (answer !== undefined) {
      stats.cacheHits++;
    } else {
      this.log.info(`${rel}: repairing ${diagnostics.length} error(s)...`);
      this.provider ??= createProvider(this.config.llm);
      answer = await this.provider.complete(SYSTEM_PROMPT, user);
      stats.llmCalls++;
      this.cache.set(key, answer);
    }

    const edits = parseEdits(answer);
    if (!edits.length) {
      this.log.debug(`${rel}: no edit blocks in answer:\n${answer.slice(0, 1000)}`);
      return undefined;
    }
    const result = applyEdits(text, edits);
    if (result.failed) this.log.debug(`${rel}: ${result.failed}/${edits.length} edit(s) did not match the source`);
    return result.applied ? result.text : undefined;
  }

  // ---------------------------------------------------------------------------------------------
  // TypeScript plumbing
  // ---------------------------------------------------------------------------------------------

  private loadProjects(): Project[] {
    const ts = this.ts;
    if (this.opts.files?.length) {
      return [
        {
          configPath: "",
          options: this.opts.compilerOptions ?? {},
          rootNames: this.opts.files.map((f) => path.resolve(this.cwd, f)),
          configDiagnostics: [],
        },
      ];
    }
    const configPath = this.opts.tsconfig
      ? path.resolve(this.cwd, this.opts.tsconfig)
      : ts.findConfigFile(this.cwd, ts.sys.fileExists, "tsconfig.json");
    if (!configPath) throw new Error(`no tsconfig.json found from ${this.cwd}`);

    const out: Project[] = [];
    const seen = new Set<string>();
    const visit = (cfg: string) => {
      if (seen.has(cfg)) return;
      seen.add(cfg);
      const configDiagnostics: TS.Diagnostic[] = [];
      const parsed = ts.getParsedCommandLineOfConfigFile(cfg, this.opts.compilerOptions ?? {}, {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic: (d) => configDiagnostics.push(d),
      });
      if (!parsed) {
        out.push({ configPath: cfg, options: {}, rootNames: [], configDiagnostics });
        return;
      }
      configDiagnostics.push(...parsed.errors.filter((e) => e.code !== 18003 /* no inputs */));
      if (parsed.fileNames.length) {
        out.push({ configPath: cfg, options: parsed.options, rootNames: parsed.fileNames, configDiagnostics });
      }
      // Solution-style configs (e.g. the Vite templates) list their real projects as references.
      // Referenced projects are checked from source rather than from their built .d.ts outputs.
      for (const ref of parsed.projectReferences ?? []) visit(ts.resolveProjectReferencePath(ref));
    };
    visit(configPath);
    return out;
  }

  /** (Re)build every project's program on top of `overlay` and return all file diagnostics. */
  private check(overlay: Map<string, string>): TS.Diagnostic[] {
    const result: TS.Diagnostic[] = [];
    const seen = new Set<string>();
    for (const project of this.projects) {
      const host = this.createCompilerHost(project.options, overlay);
      project.program = this.ts.createProgram({
        rootNames: project.rootNames,
        options: project.options,
        host,
        oldProgram: project.program,
      });
      const program = project.program;
      for (const sf of program.getSourceFiles()) {
        if (!this.isFixable(sf.fileName) || program.isSourceFileFromExternalLibrary(sf) || program.isSourceFileDefaultLibrary(sf)) continue;
        for (const d of [...program.getSyntacticDiagnostics(sf), ...program.getSemanticDiagnostics(sf)]) {
          if (d.category !== this.ts.DiagnosticCategory.Error || !d.file) continue;
          const id = `${normalizePath(d.file.fileName)}:${d.start}:${d.code}`;
          if (seen.has(id)) continue;
          seen.add(id);
          result.push(d);
        }
      }
    }
    return result;
  }

  /** A CompilerHost that serves repaired texts from `overlay` (defaults to the current fixes). */
  createCompilerHost(options: TS.CompilerOptions, overlay: ReadonlyMap<string, string> = this.fixed): TS.CompilerHost {
    const ts = this.ts;
    const host = ts.createCompilerHost(options, true);
    const readFromDisk = host.readFile.bind(host);
    host.readFile = (fileName) => {
      const key = normalizePath(fileName);
      const over = overlay.get(key);
      if (over !== undefined) return over;
      const text = readFromDisk(fileName);
      if (text !== undefined && this.isFixable(key)) this.diskTexts.set(key, text);
      return text;
    };
    host.getSourceFile = (fileName, languageVersionOrOptions, onError) => {
      const text = host.readFile(fileName);
      if (text === undefined) {
        onError?.(`File not found: ${fileName}`);
        return undefined;
      }
      const lv = languageVersionOrOptions as TS.ScriptTarget | TS.CreateSourceFileOptions;
      const cacheKey = typeof lv === "object" ? `${fileName}|${lv.languageVersion}|${lv.impliedNodeFormat}` : `${fileName}|${lv}`;
      const cached = this.sourceFileCache.get(cacheKey);
      if (cached && cached.text === text) return cached.sf;
      const sf = ts.createSourceFile(fileName, text, languageVersionOrOptions);
      this.sourceFileCache.set(cacheKey, { text, sf });
      return sf;
    };
    return host;
  }

  private isFixable(fileName: string): boolean {
    return !/[\\/]node_modules[\\/]/.test(fileName) && /\.(m|c)?tsx?$/.test(fileName);
  }

  private toPromptDiagnostic(d: TS.Diagnostic): PromptDiagnostic {
    const ts = this.ts;
    const pos = d.file!.getLineAndCharacterOfPosition(d.start ?? 0);
    const related = (d.relatedInformation ?? []).map((r) => {
      const msg = ts.flattenDiagnosticMessageText(r.messageText, "\n  ");
      if (!r.file || r.start === undefined) return msg;
      const p = r.file.getLineAndCharacterOfPosition(r.start);
      const line = r.file.text.split("\n")[p.line]?.trim() ?? "";
      return `${this.rel(r.file.fileName)}:${p.line + 1}:${p.character + 1} ${msg} -> \`${line}\``;
    });
    return {
      line: pos.line + 1,
      column: pos.character + 1,
      code: d.code,
      message: ts.flattenDiagnosticMessageText(d.messageText, "\n  "),
      related,
    };
  }

  format(diags: readonly TS.Diagnostic[]): string {
    return this.ts.formatDiagnosticsWithColorAndContext(diags, {
      getCanonicalFileName: (f) => f,
      getCurrentDirectory: () => this.cwd,
      getNewLine: () => "\n",
    });
  }

  rel(file: string): string {
    return path.relative(this.cwd, file).replace(/\\/g, "/") || file;
  }
}

/** Position-independent identity of a diagnostic (line numbers shift when a file is edited). */
function signature(d: TS.Diagnostic): string {
  const msg = typeof d.messageText === "string" ? d.messageText : d.messageText.messageText;
  return `${d.code}:${msg}`;
}

function groupByFile(diags: TS.Diagnostic[]): Map<string, TS.Diagnostic[]> {
  const map = new Map<string, TS.Diagnostic[]>();
  for (const d of diags) {
    const f = normalizePath(d.file!.fileName);
    if (!map.has(f)) map.set(f, []);
    map.get(f)!.push(d);
  }
  return map;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
