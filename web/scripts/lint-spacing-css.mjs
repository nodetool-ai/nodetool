#!/usr/bin/env node
// Spacing gate for plain .css files (DESIGN.md §2 — 4px grid).
//
// ESLint's design gate only parses .ts/.tsx, so raw px spacing in .css files
// goes unchecked. This script closes that gap: every padding / margin / gap
// declaration in our CSS must use a --spacing-* custom property (defined in
// src/styles/vars.css), never a raw px literal. `0` (flush) is allowed.
//
// Run: node scripts/lint-spacing-css.mjs  (wired into `npm run lint:design`).
// Exits 1 when any violation is found so it acts as a real gate.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const SRC = join(ROOT, "src");

// Third-party stylesheets we vendor verbatim — not ours to tokenize.
const VENDOR = [
  /styles\/markdown\/github-markdown.*\.css$/,
  /styles\/microtip\.css$/,
];

// Spacing properties whose values must be tokens. Longhands + logical props.
const SPACING_PROP =
  /^(padding|margin|gap|row-gap|column-gap|grid-gap|grid-row-gap|grid-column-gap)(-(top|right|bottom|left|inline|block)(-(start|end))?)?$/;

// px → suggested token, for a helpful message.
const PX_TO_TOKEN = {
  2: "var(--spacing-micro)",
  4: "var(--spacing-xs)",
  6: "var(--spacing-sm)",
  8: "var(--spacing-md)",
  12: "var(--spacing-lg)",
  16: "var(--spacing-xl)",
  24: "var(--spacing-xxl)",
  32: "var(--spacing-xxxl)",
};
const GRID = new Set([0, 2, 4, 6, 8, 12, 16, 24, 32]);

const nearestToken = (px) => {
  const steps = [0, 2, 4, 6, 8, 12, 16, 24, 32];
  let best = steps[0];
  for (const s of steps) {
    const d = Math.abs(s - px);
    const bd = Math.abs(best - px);
    if (d < bd || (d === bd && s > best)) best = s;
  }
  return PX_TO_TOKEN[best] ?? "var(--spacing-none)";
};

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith(".css")) out.push(p);
  }
  return out;
}

const files = walk(SRC, []).filter(
  (f) => !VENDOR.some((re) => re.test(f.replace(/\\/g, "/")))
);

const violations = [];

for (const file of files) {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    // Strip line comments to avoid false hits inside /* … */ on one line.
    const code = line.replace(/\/\*.*?\*\//g, "");
    // Match `prop: value;` declarations (value up to ; or end of line).
    const m = code.match(/(^|[;{])\s*([a-z-]+)\s*:\s*([^;{}]*)/i);
    if (!m) return;
    const prop = m[2].toLowerCase();
    if (prop.startsWith("--")) return; // variable definitions
    if (!SPACING_PROP.test(prop)) return;
    const value = m[3];
    const pxs = [...value.matchAll(/(-?\d+(?:\.\d+)?)px/g)].map((x) =>
      Math.abs(parseFloat(x[1]))
    );
    const nonZero = pxs.filter((v) => v !== 0);
    if (nonZero.length === 0) return;
    const offGrid = nonZero.some((v) => !GRID.has(v));
    violations.push({
      file: relative(ROOT, file),
      line: i + 1,
      prop,
      value: value.trim(),
      offGrid,
      suggestion: nonZero.map((v) => `${v}px→${nearestToken(v)}`).join(", "),
    });
  });
}

if (violations.length === 0) {
  console.log("✓ spacing-css: no raw px spacing in .css files");
  process.exit(0);
}

console.error(
  `✗ spacing-css: ${violations.length} raw px spacing value(s) in .css files (use var(--spacing-*) from src/styles/vars.css):\n`
);
for (const v of violations) {
  const flag = v.offGrid ? " [OFF-GRID]" : "";
  console.error(`  ${v.file}:${v.line}  ${v.prop}: ${v.value}${flag}`);
  console.error(`      → ${v.suggestion}`);
}
console.error(`\n${violations.length} violation(s).`);
process.exit(1);
