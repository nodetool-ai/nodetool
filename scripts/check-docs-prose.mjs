#!/usr/bin/env node
// Fails when a published docs page uses a banned marketing adjective.
//
// Scope: every Markdown page under docs/ that Jekyll publishes and indexes.
// Skipped: generated node reference (docs/nodes/), files in `exclude:` and
// pages under a noindex `scope:` path in docs/_config.yml. Fenced code blocks,
// inline code, and HTML comments are not checked.
//
// The rules live in docs/docs-editorial.spec.md. The word list mirrors the
// "Inflated adjectives" section of docs/WRITING_STYLE.md.
//
// Usage: node scripts/check-docs-prose.mjs [file.md ...]
// With no arguments it checks the whole published tree.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const DOCS = join(ROOT, "docs");

export const BANNED = [
  "effortless",
  "effortlessly",
  "seamless",
  "seamlessly",
  "powerful",
  "revolutionary",
  "revolutionize",
  "revolutionizes",
  "intuitive",
  "intuitively",
  "next-generation",
  "next-gen",
  "cutting-edge",
  "state-of-the-art",
  "world-class",
  "best-in-class",
  "groundbreaking",
  "game-changing",
  "game-changer",
  "blazing fast",
  "blazingly fast",
  "lightning-fast",
  "lightning fast",
  "supercharge",
  "supercharges",
  "empower",
  "empowers",
  "unleash",
  "unleashes",
];

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");

const PATTERN = new RegExp(
  `(?<![\\w-])(${BANNED.map((w) => escapeRegExp(w).replace(/ /g, "\\s+")).join("|")})(?![\\w-])`,
  "gi",
);

// Directories that never hold published, hand-written pages.
const ALWAYS_SKIP = ["_site", "vendor", "node_modules", "nodes", ".jekyll-cache"];

function readConfigSkips() {
  const config = readFileSync(join(DOCS, "_config.yml"), "utf8");
  const skips = new Set();
  // Every `scope: path` other than the site default ("") and the generated
  // node tree marks an internal page as noindex.
  for (const m of config.matchAll(/path:\s*"([^"]*)"/g)) {
    if (m[1] !== "" && m[1] !== "nodes") {
      skips.add(m[1].replace(/\/$/, ""));
    }
  }
  const excludeBlock = config.split(/^exclude:\s*$/m)[1] ?? "";
  for (const line of excludeBlock.split("\n")) {
    if (/^\S/.test(line)) {
      break;
    }
    const m = line.match(/^\s+-\s+(\S+)/);
    if (m) {
      skips.add(m[1].replace(/\/$/, ""));
    }
  }
  return skips;
}

function isSkipped(rel, skips) {
  const parts = rel.split("/");
  if (ALWAYS_SKIP.includes(parts[0])) {
    return true;
  }
  for (let i = 1; i <= parts.length; i++) {
    if (skips.has(parts.slice(0, i).join("/"))) {
      return true;
    }
  }
  return false;
}

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!ALWAYS_SKIP.includes(name) || dir !== DOCS) {
        walk(full, out);
      }
    } else if (name.endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

// Replace every character inside an HTML comment with a space, keeping
// newlines so line numbers stay intact. An unclosed comment runs to the end.
function blankComments(text) {
  let out = "";
  let pos = 0;
  while (pos < text.length) {
    const open = text.indexOf("<!--", pos);
    if (open === -1) {
      out += text.slice(pos);
      break;
    }
    out += text.slice(pos, open);
    const close = text.indexOf("-->", open + 4);
    const stop = close === -1 ? text.length : close + 3;
    out += text.slice(open, stop).replace(/[^\n]/g, " ");
    pos = stop;
  }
  return out;
}

// Blank out code and comments so their contents are never matched, keeping
// line numbers intact.
function stripCode(text) {
  let fence = null;
  return blankComments(text)
    .split("\n")
    .map((line) => {
      const fenceMatch = line.match(/^\s*(```+|~~~+)/);
      if (fence) {
        if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) {
          fence = null;
        }
        return "";
      }
      if (fenceMatch) {
        fence = fenceMatch[1];
        return "";
      }
      return line.replace(/`[^`]*`/g, "");
    });
}

export function findViolations(text) {
  const found = [];
  stripCode(text).forEach((line, i) => {
    for (const m of line.matchAll(PATTERN)) {
      found.push({ line: i + 1, word: m[1] });
    }
  });
  return found;
}

function main() {
  const args = process.argv.slice(2);
  let files;
  if (args.length > 0) {
    files = args.map((a) => resolve(a));
  } else {
    const skips = readConfigSkips();
    files = walk(DOCS, []).filter((f) => !isSkipped(relative(DOCS, f), skips));
  }
  if (files.length === 0) {
    console.error("check-docs-prose: no files to check");
    process.exit(2);
  }
  let count = 0;
  for (const file of files) {
    for (const v of findViolations(readFileSync(file, "utf8"))) {
      count++;
      console.log(`${relative(ROOT, file)}:${v.line}: banned word "${v.word}"`);
    }
  }
  if (count > 0) {
    console.error(
      `\ncheck-docs-prose: ${count} banned word(s). State what the system does instead. See docs/docs-editorial.spec.md.`,
    );
    process.exit(1);
  }
  console.log(`check-docs-prose: ${files.length} pages checked, no banned words.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
