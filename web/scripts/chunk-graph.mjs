/**
 * Static import graph over the emitted chunks in dist/assets.
 *
 * Answers the only question that matters for boot cost: which chunks does the
 * browser have to download and evaluate before the entry module finishes, and
 * which import edge put each one there. Dynamic imports (`import(...)`) are
 * deliberately ignored — those are off the critical path by construction.
 *
 * Usage:
 *   node scripts/chunk-graph.mjs                 # boot-path totals + top chunks
 *   node scripts/chunk-graph.mjs why vendor-plotly   # shortest edge chain to it
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ASSETS = "dist/assets";
const files = readdirSync(ASSETS).filter((f) => f.endsWith(".js"));

const STATIC_IMPORT_RE =
  /(?:^|[;\s}])(?:import|export)\s*(?:[\w*{}\s,$]*?\s*from\s*)?["']([^"']+)["']/g;

const graph = new Map();
for (const f of files) {
  const src = readFileSync(join(ASSETS, f), "utf8");
  const deps = new Set();
  let m;
  STATIC_IMPORT_RE.lastIndex = 0;
  while ((m = STATIC_IMPORT_RE.exec(src))) {
    const spec = m[1];
    if (spec.startsWith("./") || spec.startsWith("../")) {
      deps.add(spec.replace(/^\.{1,2}\//, ""));
    }
  }
  graph.set(f, [...deps].filter((d) => files.includes(d)));
}

const entry = files.find((f) => /^index-.*\.js$/.test(f));
if (!entry) throw new Error("entry chunk (index-*.js) not found in dist/assets");

/** BFS over static edges from the entry, recording the parent that pulled each in. */
const parent = new Map([[entry, null]]);
const queue = [entry];
while (queue.length) {
  const cur = queue.shift();
  for (const dep of graph.get(cur) ?? []) {
    if (!parent.has(dep)) {
      parent.set(dep, cur);
      queue.push(dep);
    }
  }
}

const size = (f) => statSync(join(ASSETS, f)).size;
const kb = (n) => +(n / 1024).toFixed(1);
const name = (f) => f.replace(/-[A-Za-z0-9_-]{8}\.js$/, "");

const cmd = process.argv[2];
if (cmd === "why") {
  const target = process.argv[3];
  const hit = [...parent.keys()].find((f) => name(f) === target || f === target);
  if (!hit) {
    console.log(`${target} is NOT on the static boot path.`);
    process.exit(0);
  }
  const chain = [];
  for (let c = hit; c; c = parent.get(c)) chain.push(name(c));
  console.log(chain.reverse().join("\n  → "));
  process.exit(0);
}

const onPath = [...parent.keys()];
const total = onPath.reduce((s, f) => s + size(f), 0);
console.log(`entry: ${entry}`);
console.log(`chunks on static boot path: ${onPath.length} / ${files.length}`);
console.log(`bytes on static boot path: ${kb(total)} KB`);
console.log("\ntop 20 by size:");
for (const f of onPath.sort((a, b) => size(b) - size(a)).slice(0, 20)) {
  console.log(
    `  ${String(kb(size(f))).padStart(9)} KB  ${name(f).padEnd(28)} ← ${
      parent.get(f) ? name(parent.get(f)) : "(entry)"
    }`
  );
}
