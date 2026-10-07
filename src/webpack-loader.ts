import { LlmFixer, type FixerOptions } from "./fixer";

/**
 * webpack / rspack loader. Put it LAST in the `use` array so it runs FIRST, before ts-loader,
 * babel-loader, swc-loader or esbuild-loader:
 *
 *   { test: /\.tsx?$/, use: ["babel-loader", "llmtsc/webpack-loader"] }
 */
const fixers = new Map<string, LlmFixer>();

function llmtscLoader(this: any, source: string, map: unknown) {
  const callback = this.async();
  const options: FixerOptions = (this.getOptions ? this.getOptions() : this.query) || {};
  const cwd = options.cwd ?? this.rootContext ?? process.cwd();
  const key = `${cwd}|${options.tsconfig ?? ""}`;
  let fixer = fixers.get(key);
  if (!fixer) {
    fixer = new LlmFixer({ ...options, cwd });
    fixers.set(key, fixer);
  }
  fixer.getFixedText(this.resourcePath, source).then(
    (fixed) => (fixed === undefined ? callback(null, source, map) : callback(null, fixed)),
    () => callback(null, source, map),
  );
}

export = llmtscLoader;
