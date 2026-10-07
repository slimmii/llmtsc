import type { LlmConfig } from "../config";
import { AnthropicProvider } from "./anthropic";
import { CommandProvider } from "./command";
import { OpenAIProvider } from "./openai";

export interface LlmProvider {
  /** Send a system + user prompt, return the model's text answer. */
  complete(system: string, user: string): Promise<string>;
}

export function createProvider(config: LlmConfig): LlmProvider {
  switch (config.provider) {
    case "anthropic":
      return new AnthropicProvider(config);
    case "openai":
      return new OpenAIProvider(config);
    case "command":
      return new CommandProvider(config);
  }
}
