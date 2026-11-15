import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// RT-Q8: measure the exact headers, including comments and declaration changes.
// This is an inventory, not proof of API compatibility or browser execution.
export function inspectHeaders(nativePath, browserPath, sourcePath) {
  const native = readFileSync(nativePath, "utf8");
  const browser = readFileSync(browserPath, "utf8");
  const source = readFileSync(sourcePath, "utf8");
  function declarations(text) {
    return new Set([...text.matchAll(/\b(wgpu[A-Z]\w*)\s*\(/g)].map((match) => match[1]));
  }
  const nativeNames = declarations(native);
  const browserNames = declarations(browser);
  if (nativeNames.size === 0 || browserNames.size === 0) {
    throw new Error("Both inputs must contain webgpu.h function declarations");
  }
  const calls = [...declarations(source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"/g, ""))].sort();
  if (calls.length === 0) { throw new Error("Source contains no WebGPU calls to inspect"); }
  const diff = spawnSync("git", ["diff", "--no-index", "--no-ext-diff", "--numstat", "--ignore-cr-at-eol", "--", resolve(nativePath), resolve(browserPath)], { encoding: "utf8", timeout: 30000 });
  if (diff.error || (diff.status !== 0 && diff.status !== 1)) {
    throw new Error(`Header comparison failed: ${diff.error?.message || diff.stderr || diff.status}`);
  }
  let added = 0, removed = 0;
  if (diff.status === 1) {
    const counts = /^(\d+)\t(\d+)\t/.exec(diff.stdout);
    if (!counts) { throw new Error("Expected one textual header diff"); }
    added = Number(counts[1]); removed = Number(counts[2]);
  }
  const hash = (text) => createHash("sha256").update(text).digest("hex");
  return {
    schemaVersion: 1,
    method: "git diff --no-index --numstat --ignore-cr-at-eol; added + removed lines; includes comments",
    native: { sha256: hash(native), functions: nativeNames.size },
    browser: { sha256: hash(browser), functions: browserNames.size },
    source: { sha256: hash(source), calls },
    lines: { added, removed, differing: added + removed },
    callsAbsentFromBrowserHeader: calls.filter((name) => !browserNames.has(name)),
    compatibilityEstablished: false
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 5) { throw new Error("Usage: node headers.mjs NATIVE_WEBGPU_H BROWSER_WEBGPU_H EXECUTOR_CPP"); }
    console.log(JSON.stringify(inspectHeaders(...process.argv.slice(2)), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
