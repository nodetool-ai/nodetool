#!/usr/bin/env node
// RuleTester fixture for `design-tokens/font-family-tokens` and
// `design-tokens/shadow-tokens`.
//
// The `invalid` cases are the positive control: RuleTester throws if a rule
// lets one through. The `valid` cases pin the allowed forms (token vars,
// `inherit`, focus rings, inset shadows). Wired into `npm run lint:design`.
//
// Run: node scripts/test-font-shadow-rules.mjs

import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { fontFamilyTokensRule, shadowTokensRule } from "../eslint.design.mjs";

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parser: tsParser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const raw = [{ messageId: "raw" }];

ruleTester.run("font-family-tokens", fontFamilyTokensRule, {
  valid: [
    'const a = { fontFamily: "var(--fontFamily2)" };',
    'const a = { fontFamily: "var(--fontFamily1)" };',
    'const a = { fontFamily: "inherit" };',
    "const a = { fontFamily: theme.fontFamily2 };",
    "const a = css`font-family: var(--fontFamily2);`;",
    "const a = css`font-family: ${theme.fontFamily1};`;",
  ],
  invalid: [
    { code: 'const a = { fontFamily: "monospace" };', errors: raw },
    { code: 'const a = { fontFamily: "JetBrains Mono, monospace" };', errors: raw },
    { code: "const a = { fontFamily: \"'Inter', sans-serif\" };", errors: raw },
    { code: "const a = css`font-family: Inter, sans-serif;`;", errors: raw },
    { code: "const a = css`color: red; font-family: monospace;`;", errors: raw },
  ],
});

ruleTester.run("shadow-tokens", shadowTokensRule, {
  valid: [
    "const a = { boxShadow: SHADOW(theme).lg };",
    'const a = { boxShadow: "var(--shadow-md)" };',
    'const a = { boxShadow: "none" };',
    // Focus and selection rings are borders, not elevation.
    'const a = { boxShadow: "0 0 0 2px rgba(0, 0, 0, 0.5)" };',
    'const a = { boxShadow: "0 0 0 1px #000" };',
    // Inset shadows are borders, not elevation.
    'const a = { boxShadow: "inset 0 1px 2px rgba(0,0,0,0.05)" };',
    // Interpolated layers are token references.
    "const a = { boxShadow: `0 0 0 4px rgb(${c} / 0.18), ${SHADOW(theme).lg}` };",
    'const a = { boxShadow: "0 8px 32px rgba(var(--palette-common-blackChannel) / 0.4)" };',
    "const a = css`box-shadow: ${SHADOW(theme).md};`;",
    "const a = css`box-shadow: var(--shadow-sm);`;",
  ],
  invalid: [
    { code: 'const a = { boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)" };', errors: raw },
    { code: 'const a = { boxShadow: "0 2px 4px #000" };', errors: raw },
    // A literal drop layer next to an allowed ring is still reported.
    {
      code: 'const a = { boxShadow: "0 0 0 1px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.3)" };',
      errors: raw,
    },
    { code: "const a = { boxShadow: `${ring}, 0 12px 32px rgb(0 0 0 / 0.5)` };", errors: raw },
    { code: "const a = css`box-shadow: 0 4px 12px rgba(0,0,0,0.25);`;", errors: raw },
  ],
});

console.log("font-family-tokens, shadow-tokens: rule fixtures passed");
