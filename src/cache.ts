import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";

/** Content-addressed on-disk cache of LLM answers, so rebuilds and CI runs don't pay twice. */
export class AnswerCache {
  constructor(private dir: string) {}

  static key(...parts: string[]): string {
    const h = createHash("sha256");
    for (const p of parts) h.update(p).update("\0");
    return h.digest("hex");
  }

  get(key: string): string | undefined {
    if (!this.dir) return undefined;
    try {
      return fs.readFileSync(path.join(this.dir, key.slice(0, 2), key + ".txt"), "utf8");
    } catch {
      return undefined;
    }
  }

  set(key: string, value: string): void {
    if (!this.dir) return;
    try {
      const sub = path.join(this.dir, key.slice(0, 2));
      fs.mkdirSync(sub, { recursive: true });
      fs.writeFileSync(path.join(sub, key + ".txt"), value);
    } catch {
      // A read-only cache dir must never break the build.
    }
  }
}
