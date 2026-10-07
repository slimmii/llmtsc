import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { unifiedDiff } from "./diff";
import { LlmFixer, loadTypeScript, normalizePath, type FixerOptions } from "./fixer";
import { hashText, type OverlayManifest } from "./register";

const HELP = `llmtsc - TypeScript compiler that lets an LLM repair type errors and typos before emitting.
Your source files are never modified; repairs only exist in the compiled output.

Usage:
  llmtsc [tsc options]                 Compile like tsc (reads tsconfig.json, supports -p, --outDir, ...)
  llmtsc check [-p tsconfig]           Only report what would be repaired (implies --show-fixes, no emit)
  llmtsc run [--watch] [-p tsconfig] -- <command...>
                                       Run any build tool with repaired sources served from memory,
                                       e.g. "llmtsc run -- ng build", "llmtsc run --watch -- ng serve"

llmtsc options:
  --show-fixes        Print a diff of every repair
  --no-llm            Skip the LLM (behaves like plain tsc)
  --max-passes <n>    Check/repair rounds (default 4, env LLMTSC_MAX_PASSES)
  -w, --watch         Re-run on file changes
  -h, --help

LLM configuration (environment):
  LLMTSC_PROVIDER     anthropic (default) | openai | gemini | openrouter | groq | deepseek | mistral | ollama | lmstudio | command
  LLMTSC_MODEL        model id (default claude-opus-5-5 for anthropic)
  LLMTSC_API_KEY      API key (falls back to ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, ...)
  LLMTSC_BASE_URL     custom / OpenAI-compatible endpoint
  LLMTSC_COMMAND      shell command for provider=command (prompt on stdin, answer on stdout), e.g. "claude -p"
  LLMTSC_EFFORT, LLMTSC_CONCURRENCY, LLMTSC_CACHE_DIR, LLMTSC_DISABLE, LLMTSC_LOG
`;

interface CliFlags {
  showFixes: boolean;
  noLlm: boolean;
  watch: boolean;
  maxPasses?: number;
  rest: string[];
}

function parseFlags(args: string[]): CliFlags {
  const flags: CliFlags = { showFixes: false, noLlm: false, watch: false, rest: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--show-fixes") flags.showFixes = true;
    else if (a === "--no-llm") flags.noLlm = true;
    else if (a === "--watch" || a === "-w") flags.watch = true;
    else if (a === "--max-passes") flags.maxPasses = parseInt(args[++i], 10);
    else flags.rest.push(a);
  }
  return flags;
}

export async function main(argv: string[]): Promise<number> {
  if (argv[0] === "-h" || argv[0] === "--help") {
    process.stdout.write(HELP);
    return 0;
  }
  if (argv[0] === "run") return runCommand(argv.slice(1));
  if (argv[0] === "check") return compile(argv.slice(1), { check: true });
  return compile(argv, { check: false });
}

function fixerOptions(flags: CliFlags, extra: Partial<FixerOptions> = {}): FixerOptions {
  const config: FixerOptions["config"] = {};
  if (flags.noLlm) config.disabled = true;
  if (flags.maxPasses) config.maxPasses = flags.maxPasses;
  return { cwd: process.cwd(), config, ...extra };
}

// -----------------------------------------------------------------------------------------------
// llmtsc [tsc options]  /  llmtsc check
// -----------------------------------------------------------------------------------------------

async function compile(argv: string[], mode: { check: boolean }): Promise<number> {
  const flags = parseFlags(argv);
  const ts = loadTypeScript(process.cwd());
  const cmd = ts.parseCommandLine(flags.rest);
  if (cmd.errors.length) {
    process.stderr.write(ts.formatDiagnostics(cmd.errors, formatHost(ts)));
    return 1;
  }
  if (cmd.options.version) {
    process.stdout.write(`llmtsc 0.1.0 (TypeScript ${ts.version})\n`);
    return 0;
  }
  const { project, watch, ...overrides } = cmd.options;
  const fixer = new LlmFixer(
    fixerOptions(flags, {
      tsconfig: project ? resolveProject(project as string) : undefined,
      files: cmd.fileNames.length ? cmd.fileNames : undefined,
      compilerOptions: overrides,
    }),
  );
  const once = async () => {
    const report = await fixer.ensureFresh();
    const configDiags = fixer.getConfigDiagnostics();
    if (configDiags.length) process.stderr.write(fixer.format(configDiags));
    if (flags.showFixes || mode.check) printFixes(fixer);
    if (!report) return 1;
    if (mode.check) return report.remaining.length ? 1 : 0;

    let emitSkipped = false;
    for (const program of fixer.getPrograms()) {
      const result = program.emit();
      emitSkipped ||= result.emitSkipped;
      const emitErrors = result.diagnostics.filter((d) => d.category === ts.DiagnosticCategory.Error);
      if (emitErrors.length) process.stderr.write(fixer.format(emitErrors));
    }
    // Mirror tsc's exit codes: 0 ok, 1 errors + nothing emitted, 2 errors but output generated.
    if (!report.remaining.length && !configDiags.length) return 0;
    return emitSkipped ? 1 : 2;
  };

  const code = await once();
  if (!(flags.watch || watch)) return code;

  fixer.log.info("watching for file changes...");
  watchProject(process.cwd(), fixer, async () => {
    await once();
    fixer.log.info("watching for file changes...");
  });
  return new Promise<number>(() => {});
}

function resolveProject(p: string): string {
  const abs = path.resolve(p);
  return fs.existsSync(abs) && fs.statSync(abs).isDirectory() ? path.join(abs, "tsconfig.json") : abs;
}

function printFixes(fixer: LlmFixer) {
  const fixes = fixer.getFixes();
  if (!fixes.size) {
    fixer.log.info("no repairs needed");
    return;
  }
  for (const [file, text] of fixes) {
    process.stdout.write(unifiedDiff(fixer.rel(file), fixer.getDiskText(file) ?? "", text) + "\n\n");
  }
}

function formatHost(ts: typeof import("typescript")) {
  return { getCanonicalFileName: (f: string) => f, getCurrentDirectory: () => process.cwd(), getNewLine: () => ts.sys.newLine };
}

/** Recursive watch of TypeScript files; ignores events where the content didn't actually change. */
function watchProject(dir: string, fixer: LlmFixer, onChange: () => Promise<void>) {
  let timer: NodeJS.Timeout | undefined;
  let running = false;
  let again = false;
  const fire = async () => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      fixer.invalidate();
      await onChange();
    } finally {
      running = false;
      if (again) {
        again = false;
        fire();
      }
    }
  };
  fs.watch(dir, { recursive: true }, (_event, name) => {
    if (!name) return;
    const rel = name.toString();
    if (/(^|[\\/])(node_modules|\.git|dist)([\\/]|$)/.test(rel)) return;
    if (!/\.(m|c)?tsx?$|tsconfig.*\.json$/.test(rel)) return;
    const abs = path.join(dir, rel);
    try {
      if (fs.readFileSync(abs, "utf8") === fixer.getDiskText(abs)) return; // touch / no-op save
    } catch {
      // deleted: fall through and re-run
    }
    clearTimeout(timer);
    timer = setTimeout(fire, 100);
  });
}

// -----------------------------------------------------------------------------------------------
// llmtsc run -- <command>
// -----------------------------------------------------------------------------------------------

async function runCommand(argv: string[]): Promise<number> {
  const sep = argv.indexOf("--");
  const own = sep === -1 ? [] : argv.slice(0, sep);
  const command = sep === -1 ? argv : argv.slice(sep + 1);
  if (!command.length) {
    process.stderr.write("usage: llmtsc run [--watch] [-p tsconfig.json] -- <command...>\n");
    return 1;
  }
  const flags = parseFlags(own);
  let tsconfig: string | undefined;
  const p = flags.rest.findIndex((a) => a === "-p" || a === "--project");
  if (p !== -1) tsconfig = resolveProject(flags.rest[p + 1]);

  const cwd = process.cwd();
  const fixer = new LlmFixer(fixerOptions(flags, { tsconfig }));
  const overlayDir = path.join(fixer.config.cacheDir || path.join(cwd, ".llmtsc"), "overlay");
  fs.mkdirSync(overlayDir, { recursive: true });
  const manifestPath = path.join(overlayDir, `${process.pid}.json`);

  let previous = new Map<string, string>();
  const writeManifest = () => {
    const files: OverlayManifest["files"] = {};
    for (const [file, fixed] of fixer.getFixes()) {
      const disk = fixer.getDiskText(file);
      if (disk !== undefined) files[normalizePath(file)] = { hash: hashText(disk), fixed };
    }
    const tmp = manifestPath + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, files } satisfies OverlayManifest));
    fs.renameSync(tmp, manifestPath);
    // Nudge the tool's own file watcher for files whose repaired text changed, so it re-reads them.
    const current = new Map(fixer.getFixes());
    for (const file of new Set([...previous.keys(), ...current.keys()])) {
      if (previous.get(file) === current.get(file)) continue;
      try {
        const now = new Date();
        fs.utimesSync(file, now, now);
      } catch {
        // file deleted
      }
    }
    previous = current;
  };

  await fixer.ensureFresh();
  if (flags.showFixes) printFixes(fixer);
  previous = new Map(fixer.getFixes()); // the tool hasn't read anything yet, no need to touch
  writeManifest();

  if (flags.watch) {
    watchProject(cwd, fixer, async () => {
      await fixer.ensureFresh();
      writeManifest();
    });
  }

  const register = require.resolve("./register");
  const env = {
    ...process.env,
    LLMTSC_OVERLAY: manifestPath,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require ${JSON.stringify(register)}`.trim(),
    PATH: [path.join(cwd, "node_modules", ".bin"), process.env.PATH].join(path.delimiter),
  };
  const child = spawn(command[0], command.slice(1), { stdio: "inherit", env, shell: process.platform === "win32" });
  const forward = (sig: NodeJS.Signals) => child.kill(sig);
  process.on("SIGINT", forward);
  process.on("SIGTERM", forward);

  return new Promise<number>((resolve) => {
    const cleanup = () => fs.rmSync(manifestPath, { force: true });
    child.on("error", (e) => {
      cleanup();
      process.stderr.write(`llmtsc: failed to start ${command[0]}: ${e.message}\n`);
      resolve(127);
    });
    child.on("exit", (code, signal) => {
      cleanup();
      resolve(code ?? (signal ? 1 : 0));
      process.exit(code ?? 1); // stop the watcher
    });
  });
}
