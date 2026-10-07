/**
 * Preload hook used by `llmtsc run -- <command>`.
 *
 * Loaded through NODE_OPTIONS="--require llmtsc/register", it patches Node's fs read functions so
 * that any tool running in the process (Angular CLI, webpack, Vite, Jest, ts-node, ...) receives the
 * LLM-repaired text of a TypeScript file instead of the broken text on disk. Files on disk are never
 * touched. A repaired text is only served while the file on disk is still byte-identical to the
 * text the repair was computed from.
 */
import { createHash } from "crypto";
import fs = require("fs");
import { syncBuiltinESMExports } from "module";
import * as path from "path";
import { fileURLToPath } from "url";

export interface OverlayManifest {
  version: 1;
  files: Record<string, { hash: string; fixed: string }>;
}

export const hashText = (text: string) => createHash("sha1").update(text).digest("hex");

const TS_FILE = /\.(m|c)?tsx?$/;

function install(manifestPath: string) {
  const original = {
    readFileSync: fs.readFileSync,
    readFile: fs.readFile,
    promisesReadFile: fs.promises.readFile,
  };

  let mtime = -1;
  let files: OverlayManifest["files"] = {};
  const refresh = () => {
    try {
      const m = fs.statSync(manifestPath).mtimeMs;
      if (m !== mtime) {
        files = (JSON.parse(original.readFileSync(manifestPath, "utf8") as string) as OverlayManifest).files;
        mtime = m;
      }
    } catch {
      // Manifest missing or half-written: serve the disk contents.
    }
  };

  const toPath = (p: unknown): string | undefined => {
    if (typeof p === "string") return p;
    if (p instanceof URL && p.protocol === "file:") return fileURLToPath(p);
    if (Buffer.isBuffer(p)) return p.toString();
    return undefined; // file descriptors / FileHandles are passed through
  };

  const encodingOf = (opts: unknown): BufferEncoding | null | undefined =>
    typeof opts === "string" ? (opts as BufferEncoding) : (opts as { encoding?: BufferEncoding | null } | undefined)?.encoding;

  /** Returns the replacement content (in the caller's requested encoding) or undefined. */
  const substitute = (p: unknown, opts: unknown, data: string | Buffer): string | Buffer | undefined => {
    const file = toPath(p);
    if (!file || !TS_FILE.test(file)) return undefined;
    refresh();
    const entry = files[path.resolve(file).replace(/\\/g, "/")];
    if (!entry) return undefined;
    const text = typeof data === "string" ? data : data.toString("utf8");
    if (hashText(text) !== entry.hash) return undefined;
    const encoding = encodingOf(opts);
    return encoding ? Buffer.from(entry.fixed, "utf8").toString(encoding) : Buffer.from(entry.fixed, "utf8");
  };

  (fs as any).readFileSync = function readFileSync(p: fs.PathOrFileDescriptor, opts?: unknown) {
    const data = (original.readFileSync as Function).call(fs, p, opts);
    return substitute(p, opts, data) ?? data;
  };

  (fs as any).readFile = function readFile(p: fs.PathOrFileDescriptor, opts: unknown, cb?: Function) {
    if (typeof opts === "function") {
      cb = opts;
      opts = undefined;
    }
    (original.readFile as Function).call(fs, p, opts, (err: Error | null, data: string | Buffer) => {
      if (err) return cb!(err);
      let out: string | Buffer = data;
      try {
        out = substitute(p, opts, data) ?? data;
      } catch {
        // never break the host tool
      }
      cb!(null, out);
    });
  };

  (fs.promises as any).readFile = async function readFile(p: unknown, opts?: unknown) {
    const data = await (original.promisesReadFile as Function).call(fs.promises, p, opts);
    return substitute(p, opts, data) ?? data;
  };

  // Make `import { readFile } from "node:fs/promises"` in ESM tools see the patched functions.
  syncBuiltinESMExports();
}

const manifest = process.env.LLMTSC_OVERLAY;
if (manifest && !(globalThis as any).__llmtscRegistered) {
  (globalThis as any).__llmtscRegistered = true;
  install(manifest);
}
