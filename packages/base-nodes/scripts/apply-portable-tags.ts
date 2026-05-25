#!/usr/bin/env node
/**
 * apply-portable-tags.ts — one-shot codemod that wraps each portable
 * module's `_NODES` array export with `tagAsPortable(...)`.
 *
 * Reads the classifier report at /tmp/base-nodes-classification.json,
 * finds every module with platforms === ["node","workers","edge"], then:
 *   1. Inserts `import { tagAsPortable } from "../platform-tags.js";`
 *      at the top of the file (after the existing imports), unless already
 *      present.
 *   2. Replaces the existing `export const X_NODES = [...]` (or
 *      `export const X_NODES: readonly NodeClass[] = [...]`) with
 *      `export const X_NODES = tagAsPortable([...]);`.
 *
 * Idempotent: re-running on a file that already calls `tagAsPortable`
 * leaves it untouched.
 *
 * Files without an `_NODES` array (e.g., `code-node.ts` which exports a
 * single class) are listed at the end so they can be hand-edited.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "..", "src");

interface ModuleReport {
  file: string;
  platforms: string[];
}

const REPORT_PATH = "/tmp/base-nodes-classification.json";
const reports: ModuleReport[] = JSON.parse(readFileSync(REPORT_PATH, "utf-8"));

const portable = reports.filter(
  (r) =>
    r.platforms.length === 3 &&
    r.platforms.includes("node") &&
    r.platforms.includes("workers") &&
    r.platforms.includes("edge")
);

const ARRAY_RE =
  /^export const ([A-Z][A-Z_0-9]*)(?:\s*:\s*[^=]+)?\s*=\s*\[/m;
const TAGGED_RE = /tagAsPortable\s*\(/;
const IMPORT_LINE = `import { tagAsPortable } from "../platform-tags.js";`;

const noArray: string[] = [];
const skipped: string[] = [];
const updated: string[] = [];

for (const r of portable) {
  const path = resolve(SRC, r.file);
  let src = readFileSync(path, "utf-8");

  if (TAGGED_RE.test(src)) {
    skipped.push(r.file);
    continue;
  }

  const arrayMatch = src.match(ARRAY_RE);
  if (!arrayMatch) {
    noArray.push(r.file);
    continue;
  }

  const arrayName = arrayMatch[1];
  // Find the matching closing `]` of the array literal.
  const openIdx = arrayMatch.index! + arrayMatch[0].length - 1;
  let depth = 0;
  let closeIdx = -1;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === "[") depth++;
    else if (src[i] === "]") {
      depth--;
      if (depth === 0) {
        closeIdx = i;
        break;
      }
    }
  }
  if (closeIdx === -1) {
    noArray.push(`${r.file} (could not match closing ])`);
    continue;
  }
  const arrayBody = src.slice(openIdx, closeIdx + 1); // includes [ ... ]
  // Strip a trailing `as const` if present right after the closing bracket.
  let tailStart = closeIdx + 1;
  const asConstMatch = src.slice(tailStart).match(/^\s*as\s+const\s*;/);
  let tailEnd = tailStart;
  if (asConstMatch) {
    tailEnd = tailStart + asConstMatch[0].length;
  } else {
    const semiMatch = src.slice(tailStart).match(/^\s*;/);
    if (semiMatch) tailEnd = tailStart + semiMatch[0].length;
  }
  const before = src.slice(0, arrayMatch.index!);
  const after = src.slice(tailEnd);
  const replacement = `export const ${arrayName} = tagAsPortable(${arrayBody});`;
  src = before + replacement + after;

  // Insert the import after the last existing import line.
  if (!src.includes(IMPORT_LINE)) {
    const lines = src.split("\n");
    let lastImportIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^import\s.+from\s+["'].+["'];?$/.test(lines[i].trim())) {
        lastImportIdx = i;
      }
    }
    if (lastImportIdx === -1) lastImportIdx = 0;
    lines.splice(lastImportIdx + 1, 0, IMPORT_LINE);
    src = lines.join("\n");
  }

  writeFileSync(path, src);
  updated.push(r.file);
}

console.log(`Updated ${updated.length} files:`);
for (const f of updated) console.log(`  ${f}`);
if (skipped.length > 0) {
  console.log(`\nAlready tagged, skipped ${skipped.length}:`);
  for (const f of skipped) console.log(`  ${f}`);
}
if (noArray.length > 0) {
  console.log(`\nNo _NODES array (hand-edit required): ${noArray.length}`);
  for (const f of noArray) console.log(`  ${f}`);
}
