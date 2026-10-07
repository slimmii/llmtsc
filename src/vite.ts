import * as fs from "fs";
import { LlmFixer, normalizePath, type FixerOptions } from "./fixer";

export interface LlmtscViteOptions extends Omit<FixerOptions, "cwd" | "onFixesChanged"> {
  /** Project directory containing tsconfig.json. Defaults to Vite's `root`. */
  root?: string;
}

const TS_FILE = /\.(m|c)?tsx?$/;

/**
 * Vite plugin: serves LLM-repaired TypeScript to the rest of the pipeline (esbuild / SWC / Babel).
 *
 *   import llmtsc from "llmtsc/vite";
 *   export default defineConfig({ plugins: [llmtsc(), react()] });
 */
export function llmtsc(options: LlmtscViteOptions = {}): any {
  let fixer: LlmFixer;
  let server: any;
  const loading = new Set<string>();

  return {
    name: "llmtsc",
    enforce: "pre",

    configResolved(config: { root: string }) {
      fixer = new LlmFixer({
        ...options,
        cwd: options.root ?? config.root,
        onFixesChanged(files) {
          // A repair can change when *another* file changes (e.g. a renamed export); reload those modules.
          if (!server) return;
          for (const file of files) {
            if (loading.has(file)) continue;
            for (const mod of server.moduleGraph.getModulesByFile(file) ?? []) {
              if (mod.transformResult) server.reloadModule(mod);
            }
          }
        },
      });
    },

    configureServer(s: any) {
      server = s;
    },

    async buildStart() {
      await fixer.ensureFresh();
    },

    async load(id: string) {
      if (id.startsWith("\0")) return null;
      const file = id.split("?")[0];
      if (!TS_FILE.test(file) || file.includes("/node_modules/")) return null;
      let text: string;
      try {
        text = await fs.promises.readFile(file, "utf8");
      } catch {
        return null;
      }
      const key = normalizePath(file);
      loading.add(key);
      try {
        return (await fixer.getFixedText(file, text)) ?? null;
      } finally {
        loading.delete(key);
      }
    },
  };
}

export default llmtsc;
