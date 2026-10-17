#!/usr/bin/env node
// RuleTester fixture for `design-tokens/static-palette`.
//
// Under the CSS-variables theme `theme.palette.*` is baked from the default
// colour scheme, so a colour or `mode` check read from it ignores the
// light/dark toggle. The `invalid` cases are the positive control; the `valid`
// cases pin the allowed forms (vars reads, `??` fallbacks for themes without
// vars, unrelated `.palette` members). Runs under Node and throws on the first
// mismatch. Wired into `npm run lint:design`.
//
// Run: node scripts/test-static-palette-rule.mjs

import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { staticPaletteRule } from "../eslint.design.mjs";

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parser: tsParser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const stat = [{ messageId: "static" }];

ruleTester.run("static-palette", staticPaletteRule, {
  valid: [
    "const c = theme.vars.palette.primary.main;",
    "const c = `rgb(${theme.vars.palette.primary.mainChannel} / 0.1)`;",
    "const c = theme.vars?.palette.text.primary ?? theme.palette.text.primary;",
    "const c = theme.vars?.palette?.error?.main ?? theme.palette.error.main;",
    "const c = theme.colorSchemes?.[mode]?.palette?.primary?.main;",
    "const v = document.palette.category;",
    "utils.jsScripts.palette.invalidate();",
  ],
  invalid: [
    { code: "const c = theme.palette.primary.main;", errors: stat },
    { code: "const c = alpha(theme.palette.error.main, 0.1);", errors: stat },
    { code: 'const dark = theme.palette.mode === "dark";', errors: stat },
    { code: "const c = theme.palette[tone].main;", errors: stat },
    { code: "const sx = { bgcolor: (t) => t.palette.action.hover };", errors: stat },
    { code: "const c = theme.palette.primary.main ?? fallback;", errors: stat },
  ],
});

console.log("static-palette rule: all cases pass");
