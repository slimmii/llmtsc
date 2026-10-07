import type { LlmConfig } from "../config";
import type { LlmProvider } from "./index";

/** Any OpenAI-compatible chat completions endpoint: OpenAI, Gemini, OpenRouter, Groq, Ollama, LM Studio, vLLM, ... */
export class OpenAIProvider implements LlmProvider {
  constructor(private config: LlmConfig) {}

  async complete(system: string, user: string): Promise<string> {
    const url = this.config.baseUrl!.replace(/\/+$/, "") + "/chat/completions";
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.config.apiKey) headers.authorization = `Bearer ${this.config.apiKey}`;

    let lastError: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      try {
        const res = await fetch(url, {
          method: "POST",
          headers,
          signal: AbortSignal.timeout(this.config.timeoutMs),
          body: JSON.stringify({
            model: this.config.model,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
          }),
        });
        if (res.status === 429 || res.status >= 500) {
          lastError = new Error(`${res.status} ${await res.text()}`);
          continue;
        }
        if (!res.ok) throw new Error(`${url} returned ${res.status}: ${await res.text()}`);
        const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        return json.choices?.[0]?.message?.content ?? "";
      } catch (e) {
        if (e instanceof Error && /returned 4\d\d/.test(e.message)) throw e;
        lastError = e;
      }
    }
    throw lastError;
  }
}
