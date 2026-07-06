#!/usr/bin/env node
// Motion timing gate for plain .css files (DESIGN.md §5).
//
// ESLint's design gate only parses .ts/.tsx, so raw transition/animation timing
// in .css files goes unchecked. This script closes that gap, mirroring
// lint-radius-css.mjs: every `transition` / `animation` (and their `-duration` /
// `-delay` longhands) must use a MOTION timing tier, not a raw `s`/`ms` literal.
// `0` / `0s` (no delay) and keyword-only values (`none`, `ease`) are allowed.
//
// Like the radius/spacing CSS gates, this is enforced (exit 1): WS4b migrated
// the backlog to the --motion-* duration custom properties defined in vars.css.
// A new raw s/ms timing in a transition/animation prop fails the gate.
//
// Run: node scripts/lint-motion-css.mjs  (wired into `npm run lint:design`).

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

// `transition` / `animation`, their `-duration` / `-delay` longhands, and vendor
// prefixes. The optional `-duration|-delay` group means `animation-name`,
// `animation-timing-function`, `transition-property`, etc. (no numeric timing)
// never match.
const MOTION_PROP = /^(-webkit-|-moz-|-o-)?(transition|animation)(-(duration|delay))?$/;

// A raw duration in the value: 200ms, 0.3s, 1.6s. `0`/`0s` (no delay) is fine;
// only non-zero magnitudes must become a token. `ms` is tried before `s`.
const RAW_TIME = /(\d*\.?\d+)\s*(ms|s)\b/g;

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
    if (!MOTION_PROP.test(prop)) return;
    const value = m[3];
    const times = [...value.matchAll(RAW_TIME)];
    const nonZero = times.filter((x) => parseFloat(x[1]) !== 0);
    if (nonZero.length === 0) return;
    violations.push({
      file: relative(ROOT, file),
      line: i + 1,
      prop,
      value: value.trim(),
    });
  });
}

if (violations.length === 0) {
  console.log("✓ motion-css: no raw transition/animation timing in .css files");
  process.exit(0);
}

console.error(
  `✗ motion-css: ${violations.length} raw transition/animation timing value(s) in .css files (use a --motion-* custom property from vars.css):\n`
);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  ${v.prop}: ${v.value}`);
}
console.error(`\n${violations.length} error(s). See DESIGN.md §5.`);
process.exit(1);
