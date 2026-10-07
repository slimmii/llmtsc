// Offline test-suite: uses test/mock-llm.js through the `command` provider, so no API key is needed.
const assert = require("assert");
const { execFileSync, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { parseEdits, applyEdits } = require("../dist/prompt");

const root = path.resolve(__dirname, "..");
const bin = path.join(root, "bin", "llmtsc.js");
let failures = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (e) {
    failures++;
    console.log(`  \x1b[31m✗ ${name}\x1b[0m\n${e.stack}`);
  }
}

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "llmtsc-test-"));
  fs.cpSync(path.join(__dirname, "fixtures", "typos"), dir, { recursive: true });
  return dir;
}

function llmtsc(cwd, args, env = {}) {
  return spawnSync(process.execPath, [bin, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      LLMTSC_PROVIDER: "command",
      LLMTSC_COMMAND: `"${process.execPath}" "${path.join(__dirname, "mock-llm.js")}"`,
      LLMTSC_CACHE_DIR: path.join(cwd, ".cache"),
      NODE_PATH: path.join(root, "node_modules"),
      ...env,
    },
  });
}

console.log("edits");
test("parses and applies SEARCH/REPLACE blocks", () => {
  const edits = parseEdits("blah\n<<<<<<< SEARCH\nconst a = 1;\n=======\nconst a = 2;\n>>>>>>> REPLACE\n");
  assert.deepStrictEqual(edits, [{ search: "const a = 1;", replace: "const a = 2;" }]);
  assert.strictEqual(applyEdits("x\nconst a = 1;\ny", edits).text, "x\nconst a = 2;\ny");
});
test("tolerates wrong indentation in SEARCH", () => {
  const edits = [{ search: "foo();\nbar();", replace: "foo();\nbaz();" }];
  const r = applyEdits("function f() {\n    foo();\n    bar();\n}", edits);
  assert.strictEqual(r.text, "function f() {\n    foo();\n    baz();\n}");
});
test("keeps CRLF line endings", () => {
  const r = applyEdits("a\r\nb\r\n", [{ search: "b", replace: "c" }]);
  assert.strictEqual(r.text, "a\r\nc\r\n");
});
test("skips edits that do not match", () => {
  const r = applyEdits("a\nb", [{ search: "zzz", replace: "c" }]);
  assert.strictEqual(r.applied, 0);
  assert.strictEqual(r.failed, 1);
});

console.log("cli");
test("compiles a broken project and never touches the sources", () => {
  const dir = fixture();
  const before = fs.readFileSync(path.join(dir, "src/index.ts"), "utf8");
  const res = llmtsc(dir, []);
  assert.strictEqual(res.status, 0, res.stderr);
  assert.strictEqual(fs.readFileSync(path.join(dir, "src/index.ts"), "utf8"), before);
  assert.strictEqual(execFileSync(process.execPath, [path.join(dir, "dist/index.js")], { encoding: "utf8" }).trim(), "1,4,9");
});
test("caches LLM answers", () => {
  const dir = fixture();
  const log = path.join(dir, "calls.log");
  llmtsc(dir, [], { MOCK_LLM_LOG: log });
  const first = fs.readFileSync(log, "utf8").split("\n").filter(Boolean).length;
  llmtsc(dir, [], { MOCK_LLM_LOG: log });
  const second = fs.readFileSync(log, "utf8").split("\n").filter(Boolean).length;
  assert.ok(first > 0);
  assert.strictEqual(second, first);
});
test("discards repairs that make things worse and exits like tsc (2)", () => {
  const dir = fixture();
  const res = llmtsc(dir, [], { MOCK_LLM_MODE: "worse" });
  assert.strictEqual(res.status, 2, res.stderr);
  assert.match(fs.readFileSync(path.join(dir, "dist/index.js"), "utf8"), /sqare/);
  assert.doesNotMatch(fs.readFileSync(path.join(dir, "dist/index.js"), "utf8"), /broken/);
});
test("--no-llm behaves like tsc", () => {
  const dir = fixture();
  const res = llmtsc(dir, ["--no-llm"]);
  assert.strictEqual(res.status, 2);
});
test("check prints a diff and emits nothing", () => {
  const dir = fixture();
  const res = llmtsc(dir, ["check"]);
  assert.strictEqual(res.status, 0, res.stderr);
  assert.match(res.stdout, /\+import \{ square \} from ".\/math";/);
  assert.ok(!fs.existsSync(path.join(dir, "dist")));
});
test("run serves repaired files to any Node tool", () => {
  const dir = fixture();
  const probe = path.join(dir, "probe.js");
  fs.writeFileSync(
    probe,
    `const fs = require("fs");
     const a = fs.readFileSync("src/index.ts", "utf8");
     fs.promises.readFile("src/index.ts").then((b) => console.log(JSON.stringify([a, b.toString()])));`,
  );
  const res = llmtsc(dir, ["run", "--", process.execPath, probe]);
  assert.strictEqual(res.status, 0, res.stderr);
  const [a, b] = JSON.parse(res.stdout);
  for (const text of [a, b]) {
    assert.match(text, /import \{ square \}/);
    assert.match(text, /console\.log/);
  }
  assert.match(fs.readFileSync(path.join(dir, "src/index.ts"), "utf8"), /sqare/);
});

if (failures) {
  console.log(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log("\nall tests passed");
