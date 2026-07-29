#!/usr/bin/env node
// Border-radius gate for plain .css files (DESIGN.md §4).
//
// ESLint's design gate only parses .ts/.tsx, so raw border-radius in .css files
// goes unchecked. This script closes that gap, mirroring lint-spacing-css.mjs:
// every `border-radius` declaration must use a --rounded-* custom property
// (defined in ThemeNodetool.tsx MuiCssBaseline), never a raw px/em/rem/%
// literal. `0` (flush) and keywords (`inherit`, `initial`, …) are allowed.
//
// Run: node scripts/lint-radius-css.mjs  (wired into `npm run lint:design`).
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

// `border-radius` and its longhands + vendor prefixes.
const RADIUS_PROP =
  /^(-webkit-|-moz-)?border-radius$|^border-(top|bottom)-(left|right)-radius$/;

// A raw length/percentage in the value: e.g. 4px, 0.5em, 1.5px, 50%. `0` with
// no unit is flush (allowed). A `0px` component inside a shorthand is fine too;
// only *non-zero* magnitudes must become a token.
const RAW_LEN = /(\d*\.?\d+)(px|em|rem|%)/g;

// px → suggested --rounded-* token, for a helpful message.
const PX_TO_TOKEN = {
  2: "var(--rounded-xs)",
  4: "var(--rounded-sm)",
  6: "var(--rounded-md)",
  8: "var(--rounded-lg)",
  12: "var(--rounded-xl)",
  16: "var(--rounded-xxl)",
  20: "var(--rounded-dialog)",
  9999: "var(--rounded-pill)",
};
const STEPS = [2, 4, 6, 8, 12, 16, 20, 9999];

const nearestToken = (px) => {
  let best = STEPS[0];
  for (const s of STEPS) {
    if (Math.abs(s - px) < Math.abs(best - px)) best = s;
  }
  return PX_TO_TOKEN[best];
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
    // Strip inline `/* … */` comments to avoid false hits.
    const code = line.replace(/\/\*.*?\*\//g, "");
    const m = code.match(/(^|[;{])\s*([a-z-]+)\s*:\s*([^;{}]*)/i);
    if (!m) return;
    const prop = m[2].toLowerCase();
    if (prop.startsWith("--")) return; // variable definitions
    if (!RADIUS_PROP.test(prop)) return;
    const value = m[3];
    const matches = [...value.matchAll(RAW_LEN)];
    const nonZero = matches.filter((x) => parseFloat(x[1]) !== 0);
    if (nonZero.length === 0) return;
    violations.push({
      file: relative(ROOT, file),
      line: i + 1,
      prop,
      value: value.trim(),
      suggestion: nonZero
        .map((x) => {
          const n = parseFloat(x[1]);
          if (x[2] === "%") return `${x[0]}→var(--rounded-circle)`;
          const px = x[2] === "px" ? n : n * 16; // rough em/rem→px
          return `${x[0]}→${nearestToken(px)}`;
        })
        .join(", "),
    });
  });
}

if (violations.length === 0) {
  console.log("✓ radius-css: no raw border-radius in .css files");
  process.exit(0);
}

console.error(
  `✗ radius-css: ${violations.length} raw border-radius value(s) in .css files (use var(--rounded-*) — defined in ThemeNodetool.tsx):\n`
);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  ${v.prop}: ${v.value}`);
  console.error(`      → ${v.suggestion}`);
}
console.error(`\n${violations.length} violation(s).`);
process.exit(1);
