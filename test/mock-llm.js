#!/usr/bin/env node
// Deterministic stand-in for an LLM: applies TypeScript's own "Did you mean 'x'?" suggestions.
// MOCK_LLM_MODE=worse makes it return an edit that adds errors (to test rollback).
// MOCK_LLM_LOG=<file> appends one line per call (to test caching).
const fs = require("fs");
let input = "";
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", () => {
  if (process.env.MOCK_LLM_LOG) fs.appendFileSync(process.env.MOCK_LLM_LOG, "call\n");
  const lines = input.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^- (\d+):(\d+) TS\d+: .*Did you (?:mean|mean to write) '([^']+)'\?/.exec(lines[i]);
    if (!m) continue;
    const src = lines[i + 1].slice(4);
    const col = Number(m[2]) - 1;
    const word = /^[A-Za-z_$][\w$]*/.exec(src.slice(col))[0];
    const fixed = src.slice(0, col) + m[3] + src.slice(col + word.length);
    const replacement = process.env.MOCK_LLM_MODE === "worse" ? src + "\nconst broken: number = 'x';" : fixed;
    out.push(`<<<<<<< SEARCH\n${src}\n=======\n${replacement}\n>>>>>>> REPLACE`);
  }
  process.stdout.write(out.join("\n\n") + "\n");
});
