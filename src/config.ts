import * as path from "path";

export type ProviderName = "anthropic" | "openai" | "command";

export interface LlmConfig {
  provider: ProviderName;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  /** Shell command for the `command` provider. The prompt is written to stdin, the answer read from stdout. */
  command?: string;
  /** Anthropic effort level (low | medium | high | xhigh | max). */
  effort?: string;
  maxOutputTokens: number;
  timeoutMs: number;
}

export interface LlmtscConfig {
  llm: LlmConfig;
  /** Disable the LLM step entirely (plain tsc behaviour). */
  disabled: boolean;
  /** Maximum number of check -> fix -> re-check rounds. */
  maxPasses: number;
  /** Number of files fixed in parallel. */
  concurrency: number;
  /** Directory where LLM answers are cached. Empty string disables the cache. */
  cacheDir: string;
  logLevel: "silent" | "error" | "info" | "debug";
}

/**
 * Well-known OpenAI-compatible endpoints, so `LLMTSC_PROVIDER=groq` etc. just works.
 * Each entry: base URL, env var holding the key, default model.
 */
const OPENAI_COMPATIBLE: Record<string, { baseUrl: string; keyEnv?: string; model: string }> = {
  openai: { baseUrl: "https://api.openai.com/v1", keyEnv: "OPENAI_API_KEY", model: "gpt-5" },
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    keyEnv: "GEMINI_API_KEY",
    model: "gemini-2.5-pro",
  },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", keyEnv: "OPENROUTER_API_KEY", model: "anthropic/claude-opus-5-5" },
  groq: { baseUrl: "https://api.groq.com/openai/v1", keyEnv: "GROQ_API_KEY", model: "llama-3.3-70b-versatile" },
  deepseek: { baseUrl: "https://api.deepseek.com/v1", keyEnv: "DEEPSEEK_API_KEY", model: "deepseek-chat" },
  mistral: { baseUrl: "https://api.mistral.ai/v1", keyEnv: "MISTRAL_API_KEY", model: "codestral-latest" },
  ollama: { baseUrl: "http://localhost:11434/v1", model: "qwen2.5-coder" },
  lmstudio: { baseUrl: "http://localhost:1234/v1", model: "local-model" },
};

const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";

function int(value: string | undefined, fallback: number): number {
  const n = value ? parseInt(value, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function truthy(value: string | undefined): boolean {
  return !!value && !["0", "false", "no", "off", ""].includes(value.toLowerCase());
}

/**
 * Resolve configuration from environment variables.
 *
 *   LLMTSC_PROVIDER     anthropic | openai | gemini | openrouter | groq | deepseek | mistral | ollama | lmstudio | command
 *   LLMTSC_MODEL        model id (provider specific)
 *   LLMTSC_API_KEY      API key (falls back to ANTHROPIC_API_KEY / OPENAI_API_KEY / ...)
 *   LLMTSC_BASE_URL     override the API endpoint (any OpenAI-compatible server, proxies, Azure, ...)
 *   LLMTSC_COMMAND      shell command for the `command` provider, e.g. "claude -p" or "ollama run qwen2.5-coder"
 *   LLMTSC_EFFORT       anthropic effort level (default: medium)
 *   LLMTSC_MAX_PASSES   fix rounds (default 4)
 *   LLMTSC_CONCURRENCY  parallel LLM requests (default 4)
 *   LLMTSC_CACHE_DIR    cache directory (default <project>/node_modules/.cache/llmtsc, "off" disables)
 *   LLMTSC_DISABLE      set to 1 to skip the LLM entirely
 *   LLMTSC_LOG          silent | error | info | debug (default info)
 */
export function loadConfig(projectDir: string, env: NodeJS.ProcessEnv = process.env): LlmtscConfig {
  const llm = resolveLlm(env);
  const cacheEnv = env.LLMTSC_CACHE_DIR;
  const cacheDir =
    cacheEnv === "off" || cacheEnv === "0"
      ? ""
      : cacheEnv
        ? path.resolve(projectDir, cacheEnv)
        : path.join(projectDir, "node_modules", ".cache", "llmtsc");
  const log = (env.LLMTSC_LOG || "info").toLowerCase();
  return {
    llm,
    disabled: truthy(env.LLMTSC_DISABLE),
    maxPasses: int(env.LLMTSC_MAX_PASSES, 4),
    concurrency: int(env.LLMTSC_CONCURRENCY, 4),
    cacheDir,
    logLevel: (["silent", "error", "info", "debug"].includes(log) ? log : "info") as LlmtscConfig["logLevel"],
  };
}

function resolveLlm(env: NodeJS.ProcessEnv): LlmConfig {
  let provider = (env.LLMTSC_PROVIDER || "").toLowerCase();
  if (!provider) {
    // Pick whatever the environment is already set up for.
    if (env.LLMTSC_COMMAND) provider = "command";
    else if (env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN) provider = "anthropic";
    else if (env.OPENAI_API_KEY) provider = "openai";
    else if (env.GEMINI_API_KEY) provider = "gemini";
    else if (env.OPENROUTER_API_KEY) provider = "openrouter";
    else provider = "anthropic";
  }

  const common = {
    maxOutputTokens: int(env.LLMTSC_MAX_TOKENS, 32000),
    timeoutMs: int(env.LLMTSC_TIMEOUT_MS, 10 * 60 * 1000),
  };

  if (provider === "anthropic" || provider === "claude") {
    return {
      ...common,
      provider: "anthropic",
      model: env.LLMTSC_MODEL || DEFAULT_ANTHROPIC_MODEL,
      apiKey: env.LLMTSC_API_KEY || undefined, // SDK falls back to ANTHROPIC_API_KEY / auth profile
      baseUrl: env.LLMTSC_BASE_URL || undefined,
      effort: env.LLMTSC_EFFORT || "medium",
    };
  }

  if (provider === "command") {
    if (!env.LLMTSC_COMMAND) throw new Error("LLMTSC_PROVIDER=command requires LLMTSC_COMMAND (e.g. \"claude -p\")");
    return { ...common, provider: "command", model: env.LLMTSC_MODEL || env.LLMTSC_COMMAND, command: env.LLMTSC_COMMAND };
  }

  const preset = OPENAI_COMPATIBLE[provider];
  if (!preset && !env.LLMTSC_BASE_URL) {
    throw new Error(
      `Unknown LLMTSC_PROVIDER "${provider}". Use one of: anthropic, command, ${Object.keys(OPENAI_COMPATIBLE).join(", ")}, ` +
        `or set LLMTSC_BASE_URL to any OpenAI-compatible endpoint.`,
    );
  }
  const model = env.LLMTSC_MODEL || preset?.model;
  if (!model) throw new Error("LLMTSC_MODEL is required for a custom OpenAI-compatible endpoint");
  return {
    ...common,
    provider: "openai",
    model,
    baseUrl: env.LLMTSC_BASE_URL || preset!.baseUrl,
    apiKey: env.LLMTSC_API_KEY || (preset?.keyEnv ? env[preset.keyEnv] : undefined),
  };
}
