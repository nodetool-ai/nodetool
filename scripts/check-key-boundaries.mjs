#!/usr/bin/env node
// Guards against the key-boundary bug class fixed in #2997 (commit 4d885eaf):
// per-workflow store cleanup used `key.startsWith(workflowId)` without a trailing
// delimiter, so closing workflow "wf1" also matched and wiped entries for
// "wf10", "wf1a", etc. The fix everywhere is to anchor the prefix with the
// literal separator the keys actually use: `key.startsWith(`${workflowId}:`)`.
//
// This check fails on a `String.prototype.startsWith` whose prefix is not
// delimiter-anchored:
//   - a bare identifier ending in `Id`     →  key.startsWith(workflowId)
//   - a template literal ending in `${…}`  →  key.startsWith(`${workflowId}`)
// A template that ends with a delimiter char (`${id}:`, `${id}/`, `${id}.`) is
// fine, which is exactly the corrected form. Add `// key-boundary-ok` on the
// line to opt a deliberate exception out.

import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

// Source roots that ship runtime/UI key logic. mobile/ has its own tree.
const SCAN_ROOTS = [
  "web/src",
  "electron/src",
  "mobile/src",
  ...(await listPackageSrcDirs()),
];

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".jsx"]);
const SKIP_DIRS = new Set(["node_modules", "dist", "build", "__tests__", "tests", "test", "coverage", ".turbo"]);
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// .startsWith( <bare identifier ending in Id> )  — e.g. startsWith(workflowId)
const BARE_ID = /\.startsWith\(\s*([A-Za-z_$][\w$]*[Ii]d)\s*\)/g;
// .startsWith( `…${…}` )  where the template ends immediately after the
// interpolation — i.e. `}` is the last char before the closing backtick, so no
// delimiter anchors the prefix. `${id}:` / `${id}/` won't match (a char sits
// between `}` and the backtick).
const UNANCHORED_TEMPLATE = /\.startsWith\(\s*`[^`]*\$\{[^`}]*\}`\s*\)/g;

async function listPackageSrcDirs() {
  const dirs = [];
  const packagesDir = join(repoRoot, "packages");
  let entries;
  try {
    entries = await readdir(packagesDir, { withFileTypes: true });
  } catch {
    return dirs;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) dirs.push(`packages/${entry.name}/src`);
  }
  return dirs;
}

async function collectSourceFiles(dir) {
  const files = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      files.push(...(await collectSourceFiles(full)));
    } else if (
      SOURCE_EXTENSIONS.has(full.slice(full.lastIndexOf("."))) &&
      !TEST_FILE.test(entry.name)
    ) {
      files.push(full);
    }
  }
  return files;
}

const violations = [];

for (const root of SCAN_ROOTS) {
  const files = await collectSourceFiles(join(repoRoot, root));
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const lines = source.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes("key-boundary-ok")) continue;
      BARE_ID.lastIndex = 0;
      UNANCHORED_TEMPLATE.lastIndex = 0;
      const hit = BARE_ID.test(line) || UNANCHORED_TEMPLATE.test(line);
      if (hit) {
        violations.push({
          file: file.slice(repoRoot.length + 1),
          line: i + 1,
          text: line.trim(),
        });
      }
    }
  }
}

if (violations.length > 0) {
  console.error("Unanchored startsWith() prefix — key-boundary bug risk:\n");
  for (const { file, line, text } of violations) {
    console.error(`  ${file}:${line}\n    ${text}`);
  }
  console.error(
    "\nAnchor the prefix with the key's literal delimiter so a shorter id can't\n" +
      "match a longer one (`wf1` matching `wf10`). Use\n" +
      "  key.startsWith(`${workflowId}:`)   not   key.startsWith(workflowId)\n" +
      "See #2997 (commit 4d885eaf). Add `// key-boundary-ok` for a deliberate exception."
  );
  process.exit(1);
}

console.log(`Key-boundary check passed (scanned ${SCAN_ROOTS.length} source roots).`);
