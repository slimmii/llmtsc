import type { LlmtscConfig } from "./config";

export interface Logger {
  error(msg: string): void;
  info(msg: string): void;
  debug(msg: string): void;
}

const LEVELS = { silent: 0, error: 1, info: 2, debug: 3 } as const;

export function createLogger(level: LlmtscConfig["logLevel"]): Logger {
  const n = LEVELS[level];
  const out = (msg: string) => process.stderr.write(`\x1b[35m[llmtsc]\x1b[0m ${msg}\n`);
  return {
    error: (m) => n >= 1 && out(`\x1b[31m${m}\x1b[0m`),
    info: (m) => n >= 2 && out(m),
    debug: (m) => n >= 3 && out(`\x1b[2m${m}\x1b[0m`),
  };
}
