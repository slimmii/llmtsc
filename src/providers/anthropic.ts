import Anthropic from "@anthropic-ai/sdk";
import type { LlmConfig } from "../config";
import type { LlmProvider } from "./index";

export class AnthropicProvider implements LlmProvider {
  private client: Anthropic;

  constructor(private config: LlmConfig) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      timeout: config.timeoutMs,
    });
  }

  async complete(system: string, user: string): Promise<string> {
    const stream = this.client.beta.messages.stream({
      model: this.config.model,
      max_tokens: this.config.maxOutputTokens,
      system,
      messages: [{ role: "user", content: user }],
      thinking: { type: "adaptive" },
      output_config: { effort: this.config.effort as "low" | "medium" | "high" | "xhigh" | "max" },
      // If a safety classifier declines the request, let the API retry it on its recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") {
      throw new Error(`model declined the request (${message.stop_details?.category ?? "no category"})`);
    }
    return message.content.map((block) => (block.type === "text" ? block.text : "")).join("");
  }
}
