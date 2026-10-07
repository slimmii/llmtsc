/** Minimal unified line diff, used by `--show-fixes`. */
export function unifiedDiff(name: string, a: string, b: string, context = 2): string {
  const x = a.split("\n");
  const y = b.split("\n");
  // Trim common prefix/suffix so the LCS table stays small.
  let start = 0;
  while (start < x.length && start < y.length && x[start] === y[start]) start++;
  let endX = x.length;
  let endY = y.length;
  while (endX > start && endY > start && x[endX - 1] === y[endY - 1]) {
    endX--;
    endY--;
  }
  const xs = x.slice(start, endX);
  const ys = y.slice(start, endY);
  const lcs: number[][] = Array.from({ length: xs.length + 1 }, () => new Array(ys.length + 1).fill(0));
  for (let i = xs.length - 1; i >= 0; i--)
    for (let j = ys.length - 1; j >= 0; j--)
      lcs[i][j] = xs[i] === ys[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);

  type Op = { t: " " | "-" | "+"; s: string; ai: number; bi: number };
  const ops: Op[] = [];
  for (let k = 0; k < start; k++) ops.push({ t: " ", s: x[k], ai: k, bi: k });
  let i = 0;
  let j = 0;
  while (i < xs.length || j < ys.length) {
    if (i < xs.length && j < ys.length && xs[i] === ys[j]) {
      ops.push({ t: " ", s: xs[i], ai: start + i++, bi: start + j++ });
    } else if (i < xs.length && (j >= ys.length || lcs[i + 1][j] >= lcs[i][j + 1])) {
      ops.push({ t: "-", s: xs[i], ai: start + i++, bi: start + j });
    } else {
      ops.push({ t: "+", s: ys[j], ai: start + i, bi: start + j++ });
    }
  }
  for (let k = 0; k < x.length - endX; k++) ops.push({ t: " ", s: x[endX + k], ai: endX + k, bi: endY + k });

  const out = [`\x1b[1m--- ${name} (on disk)\n+++ ${name} (compiled)\x1b[0m`];
  let k = 0;
  while (k < ops.length) {
    if (ops[k].t === " ") {
      k++;
      continue;
    }
    const from = Math.max(0, k - context);
    let to = k;
    while (to < ops.length) {
      if (ops[to].t !== " ") {
        to++;
        continue;
      }
      let run = 0;
      while (to + run < ops.length && ops[to + run].t === " ") run++;
      if (to + run >= ops.length || run > context * 2) {
        to = Math.min(ops.length, to + context);
        break;
      }
      to += run;
    }
    const hunk = ops.slice(from, to);
    const aLen = hunk.filter((o) => o.t !== "+").length;
    const bLen = hunk.filter((o) => o.t !== "-").length;
    out.push(`\x1b[36m@@ -${hunk[0].ai + 1},${aLen} +${hunk[0].bi + 1},${bLen} @@\x1b[0m`);
    for (const o of hunk) {
      const color = o.t === "-" ? "\x1b[31m" : o.t === "+" ? "\x1b[32m" : "";
      out.push(`${color}${o.t}${o.s}${color ? "\x1b[0m" : ""}`);
    }
    k = to;
  }
  return out.join("\n");
}
