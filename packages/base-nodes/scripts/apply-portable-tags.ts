#!/usr/bin/env node
/**
 * apply-portable-tags.ts — one-shot codemod that wraps each portable
 * module's `_NODES` array export with the correct tagging helper.
 *
 * Reads the classifier report at /tmp/base-nodes-classification.json,
 * then for each module:
 *   - platforms = [node, workers, edge]   → wrap with tagAsServer(...)
 *   - platforms = [node, browser]         → wrap with tagAsHybrid(...)
 *   - platforms = [node, workers, edge, browser] → wrap with tagAsUniversal(...)
 *   - other (node-only, workers+node, etc.) → skip
 *
 * Inserts the matching helper import after the existing import block,
 * unless already present.
 *
 * Idempotent: re-running on a file that already calls one of the
 * helpers leaves it untouched.
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

type Helper = "tagAsServer" | "tagAsHybrid" | "tagAsUniversal";

function pickHelper(platforms: string[]): Helper | null {
  const set = new Set(platforms);
  const hasServer = set.has("node") && set.has("workers") && set.has("edge");
  const hasBrowser = set.has("browser");
  if (hasServer && hasBrowser && set.size === 4) return "tagAsUniversal";
  if (hasServer && !hasBrowser) return "tagAsServer";
  if (set.has("node") && hasBrowser && set.size === 2) return "tagAsHybrid";
  return null;
}

const ARRAY_RE =
  /^export const ([A-Z][A-Z_0-9]*)(?:\s*:\s*[^=]+)?\s*=\s*\[/m;
const ALREADY_TAGGED_RE = /tagAs(?:Server|Hybrid|Universal)\s*\(/;
const importLine = (h: Helper): string =>
  `import { ${h} } from "../platform-tags.js";`;

const noArray: string[] = [];
const skipped: string[] = [];
const updated: Record<Helper, string[]> = {
  tagAsServer: [],
  tagAsHybrid: [],
  tagAsUniversal: []
};

for (const r of reports) {
  const helper = pickHelper(r.platforms);
  if (!helper) continue;

  const path = resolve(SRC, r.file);
  let src = readFileSync(path, "utf-8");

  if (ALREADY_TAGGED_RE.test(src)) {
    skipped.push(`${r.file} (${helper})`);
    continue;
  }

  const arrayMatch = src.match(ARRAY_RE);
  if (!arrayMatch) {
    noArray.push(`${r.file} (would be ${helper})`);
    continue;
  }

  const arrayName = arrayMatch[1];
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
  const arrayBody = src.slice(openIdx, closeIdx + 1);
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
  const replacement = `export const ${arrayName} = ${helper}(${arrayBody});`;
  src = before + replacement + after;

  const want = importLine(helper);
  if (!src.includes(want)) {
    const lines = src.split("\n");
    let lastImportIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^import\s.+from\s+["'].+["'];?$/.test(lines[i].trim())) {
        lastImportIdx = i;
      }
    }
    if (lastImportIdx === -1) lastImportIdx = 0;
    lines.splice(lastImportIdx + 1, 0, want);
    src = lines.join("\n");
  }

  writeFileSync(path, src);
  updated[helper].push(r.file);
}

for (const [helper, files] of Object.entries(updated)) {
  if (files.length === 0) continue;
  console.log(`Updated ${files.length} files with ${helper}:`);
  for (const f of files) console.log(`  ${f}`);
  console.log();
}
if (skipped.length > 0) {
  console.log(`Already tagged, skipped ${skipped.length}:`);
  for (const f of skipped) console.log(`  ${f}`);
}
if (noArray.length > 0) {
  console.log(`\nNo _NODES array (hand-edit required): ${noArray.length}`);
  for (const f of noArray) console.log(`  ${f}`);
}
