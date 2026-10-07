export const PROMPT_VERSION = "1";

export const SYSTEM_PROMPT = `You are the error-repair stage of a TypeScript compiler.
You receive one source file together with the compiler diagnostics reported for it.
Your job is to make the file compile with as small an edit as possible, while keeping what the author clearly meant.

Rules:
- Fix the actual cause: typos in identifiers/properties/imports, wrong argument order or count, missing or wrong type annotations, missing imports, null checks, wrong generic arguments, syntax slips, etc.
- Preserve runtime behaviour and the author's intent. Never delete functionality to silence an error.
- Only fall back to a cast or "// @ts-expect-error" when there is no reasonable real fix.
- Do not reformat, reorder, or touch code unrelated to the diagnostics.

Answer ONLY with edit blocks in exactly this format (any number of blocks, no other prose required):

<<<<<<< SEARCH
exact lines copied from the file, including indentation
=======
replacement lines
>>>>>>> REPLACE

The SEARCH part must match the current file text exactly (without line-number prefixes) and be long enough to be unique.
To add new lines (e.g. a missing import), SEARCH for an existing neighbouring line and repeat it in the REPLACE part together with the new lines.`;

export interface PromptDiagnostic {
  line: number; // 1-based
  column: number; // 1-based
  code: number;
  message: string;
  related: string[];
}

export function buildUserPrompt(fileName: string, text: string, diagnostics: PromptDiagnostic[]): string {
  const lines = text.split("\n");
  const width = String(lines.length).length;
  const numbered = lines.map((l, i) => `${String(i + 1).padStart(width)}| ${l}`).join("\n");
  const diags = diagnostics
    .map((d) => {
      const src = lines[d.line - 1] ?? "";
      const caret = " ".repeat(Math.max(0, d.column - 1)) + "^";
      let s = `- ${d.line}:${d.column} TS${d.code}: ${d.message}\n    ${src}\n    ${caret}`;
      for (const r of d.related) s += `\n    related: ${r}`;
      return s;
    })
    .join("\n");
  return `File: ${fileName}

Diagnostics:
${diags}

Source (line numbers are for reference only, do not include them in SEARCH blocks):
${numbered}`;
}

export interface Edit {
  search: string;
  replace: string;
}

const BLOCK_RE = /<{5,9} ?SEARCH[^\n]*\n([\s\S]*?)\n?={5,9}[^\n]*\n([\s\S]*?)\n?>{5,9} ?REPLACE/g;

export function parseEdits(answer: string): Edit[] {
  const edits: Edit[] = [];
  for (const m of answer.replace(/\r\n/g, "\n").matchAll(BLOCK_RE)) {
    edits.push({ search: m[1], replace: m[2] });
  }
  return edits;
}

/**
 * Apply SEARCH/REPLACE edits. Exact match first, then a whitespace-tolerant line match
 * (models often get indentation slightly wrong). Edits that cannot be located are skipped.
 */
export function applyEdits(text: string, edits: Edit[]): { text: string; applied: number; failed: number } {
  let applied = 0;
  let failed = 0;
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  let current = text.replace(/\r\n/g, "\n");
  for (const edit of edits) {
    if (edit.search === "") {
      // Pure insertion at top of file.
      current = edit.replace + "\n" + current;
      applied++;
      continue;
    }
    const idx = current.indexOf(edit.search);
    if (idx !== -1) {
      current = current.slice(0, idx) + edit.replace + current.slice(idx + edit.search.length);
      applied++;
      continue;
    }
    const fuzzy = fuzzyLineReplace(current, edit);
    if (fuzzy !== undefined) {
      current = fuzzy;
      applied++;
    } else {
      failed++;
    }
  }
  return { text: eol === "\n" ? current : current.replace(/\n/g, eol), applied, failed };
}

function fuzzyLineReplace(text: string, edit: Edit): string | undefined {
  const lines = text.split("\n");
  const search = edit.search.split("\n");
  while (search.length && search[search.length - 1].trim() === "") search.pop();
  if (!search.length) return undefined;
  const norm = (s: string) => s.trim().replace(/\s+/g, " ");
  const target = search.map(norm);
  for (let i = 0; i + target.length <= lines.length; i++) {
    let ok = true;
    for (let j = 0; j < target.length && ok; j++) ok = norm(lines[i + j]) === target[j];
    if (!ok) continue;
    // Re-indent replacement relative to the indentation actually found in the file.
    const fileIndent = /^\s*/.exec(lines[i])![0];
    const searchIndent = /^\s*/.exec(search[0])![0];
    const replacement = edit.replace.split("\n").map((l) =>
      l.startsWith(searchIndent) ? fileIndent + l.slice(searchIndent.length) : l,
    );
    lines.splice(i, target.length, ...replacement);
    return lines.join("\n");
  }
  return undefined;
}
