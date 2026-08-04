/**
 * Shortest static-import path from the app entry to a given module.
 *
 * The chunk graph says which bundles the boot path drags in; this says which
 * source file is responsible. Type-only imports are skipped — they are erased
 * and cost nothing at runtime — as are dynamic `import()` calls, which are the
 * whole point of code splitting.
 *
 * Usage:
 *   node scripts/import-path.mjs hooks/editor/useMonacoEditor
 *   node scripts/import-path.mjs three --from src/index.tsx
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";

const args = process.argv.slice(2);
const target = args[0];
if (!target) {
  console.error("usage: node scripts/import-path.mjs <substring> [--from file]");
  process.exit(1);
}
const fromArg = args.indexOf("--from");
const ENTRY = resolve(fromArg === -1 ? "src/index.tsx" : args[fromArg + 1]);
const ROOT = resolve("src");

const EXTS = [".ts", ".tsx", ".js", ".jsx"];
const resolveFile = (spec, importer) => {
  if (!spec.startsWith(".")) return null; // bare specifier — a package, not app code
  const base = resolve(dirname(importer), spec);
  for (const c of [base, ...EXTS.map((e) => base + e), ...EXTS.map((e) => `${base}/index${e}`)]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
};

// Static `import ... from "x"` and `export ... from "x"`, excluding `import type`
// / `export type` (erased) and `import(` (dynamic).
const IMPORT_RE =
  /(?:^|\n)\s*(?:import|export)\s+(?!type\s)(?:[^;'"]*?\sfrom\s+)?["']([^"']+)["']/g;

const cache = new Map();
const importsOf = (file) => {
  if (cache.has(file)) return cache.get(file);
  let src = "";
  try {
    src = readFileSync(file, "utf8");
  } catch {
    cache.set(file, []);
    return [];
  }
  const out = [];
  IMPORT_RE.lastIndex = 0;
  let m;
  while ((m = IMPORT_RE.exec(src))) {
    // Drop named type-only bindings: `import { type A } from` still loads the
    // module at runtime, so those stay.
    out.push(m[1]);
  }
  cache.set(file, out);
  return out;
};

const parent = new Map([[ENTRY, null]]);
const queue = [ENTRY];
const hits = [];
while (queue.length) {
  const cur = queue.shift();
  for (const spec of importsOf(cur)) {
    if (!spec.startsWith(".")) {
      if (spec.includes(target)) hits.push([cur, spec]);
      continue;
    }
    const file = resolveFile(spec, cur);
    if (!file || parent.has(file)) continue;
    parent.set(file, cur);
    if (file.includes(target)) hits.push([file, null]);
    queue.push(file);
  }
}

if (!hits.length) {
  console.log(`No static import path from ${relative(".", ENTRY)} to "${target}".`);
  process.exit(0);
}

const seen = new Set();
for (const [file, bare] of hits.slice(0, 10)) {
  const start = bare ? file : file;
  const chain = [];
  for (let c = start; c; c = parent.get(c)) chain.push(relative(ROOT, c));
  chain.reverse();
  const key = chain.join(">") + (bare ?? "");
  if (seen.has(key)) continue;
  seen.add(key);
  console.log((bare ? [...chain, `[pkg] ${bare}`] : chain).join("\n  → "));
  console.log("");
}
