#!/usr/bin/env node
// Font-size + color gate for plain .css files (DESIGN.md §1 + §3).
//
// ESLint's design gate only parses .ts/.tsx, so raw font sizes / colors in .css
// files go unchecked. This script closes that gap, mirroring lint-spacing-css.mjs:
//
//   - font-size: every `font-size` declaration must use a token
//     (var(--fontSize*)); raw px/rem are forbidden. `em` is allowed (icon
//     scaling, per DESIGN.md §1).
//   - color: every color/background/border/outline declaration must route
//     through a CSS var (var(--palette-*) / var(--c_*)); raw #hex / rgb()/rgba()
//     / hsl() literals are forbidden. fill/stroke (SVG) and shadow/filter props
//     are out of scope, matching the TSX color rule.
//
// Run: node scripts/lint-font-color-css.mjs  (wired into `npm run lint:design`).
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

// Color properties whose values must be tokens. Mirrors the TSX color rule:
// fill/stroke (SVG) and box-shadow/filter (elevation/effects) are out of scope.
const COLOR_PROP =
  /^(color|background|background-color|border|border-top|border-right|border-bottom|border-left|border-color|border-top-color|border-right-color|border-bottom-color|border-left-color|outline|outline-color|caret-color|text-decoration-color|column-rule-color)$/;

// A *complete* raw color literal: #hex, or a closed rgb()/rgba()/hsl()/hsla().
// Requiring the closing paren avoids flagging multi-line `rgba(\n var(--…)\n)`
// values, which are theme-driven and split across lines.
const RAW_COLOR = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/;

// A *bare* px/rem font size (the entire value is one px/rem number). Matches the
// TSX rule's anchored check: `em` (icon scaling, §1) and px/rem embedded in a
// math function such as `max(16px, 1em)` (the iOS input-zoom guard) are allowed.
const RAW_FONT_SIZE = /^[0-9]*\.?[0-9]+(px|rem)$/;

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
    // Strip single-line comments to avoid false hits inside /* … */.
    const code = line.replace(/\/\*.*?\*\//g, "");
    const m = code.match(/(^|[;{])\s*([a-z-]+)\s*:\s*([^;{}]*)/i);
    if (!m) return;
    const prop = m[2].toLowerCase();
    if (prop.startsWith("--")) return; // custom-property definitions
    const value = m[3];
    if (/var\(\s*--/.test(value)) return; // already theme-driven

    if (prop === "font-size" && RAW_FONT_SIZE.test(value)) {
      violations.push({
        file: relative(ROOT, file),
        line: i + 1,
        kind: "font-size",
        decl: `${prop}: ${value.trim()}`,
        hint: "use var(--fontSizeBig/Normal/Small/Smaller)",
      });
    } else if (COLOR_PROP.test(prop) && RAW_COLOR.test(value)) {
      violations.push({
        file: relative(ROOT, file),
        line: i + 1,
        kind: "color",
        decl: `${prop}: ${value.trim()}`,
        hint: "use var(--palette-*) / var(--c_*)",
      });
    }
  });
}

if (violations.length === 0) {
  console.log("✓ font-color-css: no raw font sizes or colors in .css files");
  process.exit(0);
}

console.error(
  `✗ font-color-css: ${violations.length} raw font-size/color value(s) in .css files:\n`
);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  [${v.kind}]  ${v.decl}`);
  console.error(`      → ${v.hint}`);
}
console.error(`\n${violations.length} violation(s).`);
process.exit(1);
