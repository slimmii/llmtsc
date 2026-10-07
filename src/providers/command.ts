import { spawn } from "child_process";
import type { LlmConfig } from "../config";
import type { LlmProvider } from "./index";

/**
 * Pipe the prompt into an arbitrary shell command and use its stdout as the answer.
 * Works with e.g. `claude -p`, `ollama run qwen2.5-coder`, `llm -m gpt-5`, or your own script.
 */
export class CommandProvider implements LlmProvider {
  constructor(private config: LlmConfig) {}

  complete(system: string, user: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.config.command!, { shell: true, stdio: ["pipe", "pipe", "pipe"] });
      let out = "";
      let err = "";
      const timer = setTimeout(() => child.kill("SIGKILL"), this.config.timeoutMs);
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (err += d));
      child.on("error", reject);
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve(out);
        else reject(new Error(`"${this.config.command}" exited with ${code}: ${err.slice(0, 500)}`));
      });
      child.stdin.end(`${system}\n\n${user}`);
    });
  }
}
