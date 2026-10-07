export { LlmFixer, loadTypeScript, normalizePath, type FixerOptions, type FixReport } from "./fixer";
export { loadConfig, type LlmtscConfig, type LlmConfig } from "./config";
export { createProvider, type LlmProvider } from "./providers";
export { llmtsc as vitePlugin } from "./vite";

import { LlmFixer, type FixerOptions } from "./fixer";

/** Convenience: check + repair a project once and return the fixer (repaired texts via getFixes()). */
export async function fixProject(options: FixerOptions = {}): Promise<LlmFixer> {
  const fixer = new LlmFixer(options);
  await fixer.ensureFresh();
  return fixer;
}
