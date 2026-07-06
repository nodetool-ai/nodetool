#!/usr/bin/env node
// RuleTester fixture for the `design-tokens/motion-tokens` rule (DESIGN.md §5).
//
// The sibling design-token rules carry no unit tests, but the motion rule's
// tagged-template handling is subtle: a CSS decl can be split across quasis by a
// `${keyframe}` placeholder (`css`animation: ${kf} 1.9s …``), so `animation:`
// and its `1.9s` land in different quasis. The handler carries an "open decl"
// flag across quasis to catch that; this fixture pins the quasi-splitting down.
//
// It runs directly under Node (no Jest): both this script and eslint.design.mjs
// are ESM, sidestepping Jest's always-ESM treatment of `.mjs`. ESLint's
// RuleTester executes cases synchronously and throws on the first failure, so a
// mismatch exits non-zero. Wired into `npm run lint:design`.
//
// Run: node scripts/test-motion-rule.mjs

import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { motionTokensRule } from "../eslint.design.mjs";

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parser: tsParser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const raw = [{ messageId: "raw" }];

ruleTester.run("motion-tokens", motionTokensRule, {
  valid: [
    // Object prop built purely from MOTION tokens — no raw timing in the quasis.
    "const s = { animation: `${activePop} ${MOTION.slow}` };",
    "const s = { transition: `transform ${MOTION.fast} ease` };",
    // Tagged-template CSS built from a MOTION token placeholder (migrated form).
    "const s = css`animation: ${kf} ${MOTION.spin};`;",
    "const s = css`animation: ${MOTION.spin};`;",
    // Zero timings and keyword-only values are allowed.
    'const s = { animationDelay: "0s" };',
    'const s = { transition: "none" };',
    "const s = css`transition: color 0s;`;",
    // A keyframes body carries no transition/animation timing declaration.
    "const rotate = keyframes`0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); }`;",
    // Non-motion property interrupted by a placeholder must not false-positive.
    "const s = css`grid-template-columns: ${cols};`;",
  ],
  invalid: [
    // Form 3 — interpolated keyframe as an object-property value.
    {
      code: "const s = { animation: `${kf} 1.6s ease-in-out infinite` };",
      errors: raw,
    },
    // Plain string-literal object prop (pre-existing coverage).
    {
      code: 'const s = { animation: "spin 1s linear infinite" };',
      errors: raw,
    },
    { code: 'const s = { transitionDuration: "200ms" };', errors: raw },
    // Form 4 — the tagged-template split: `animation:` and `1.9s` in different
    // quasis, separated by `${rotate}`. This is the case the review flagged.
    {
      code: "const s = css`animation: ${rotate} 1.9s linear infinite;`;",
      errors: raw,
    },
    {
      code: "const s = css`animation: ${dash} 1.55s cubic-bezier(0.42, 0, 0.28, 1) infinite;`;",
      errors: raw,
    },
    // Split decl carrying two raw times (duration + delay) in the trailing quasi.
    {
      code: "const s = css`animation: ${rise} 500ms 80ms backwards;`;",
      errors: raw,
    },
    // Form 5 — fully-contained decl inside one quasi.
    { code: "const s = css`transition: color 0.2s;`;", errors: raw },
  ],
});

console.log("motion-tokens rule: all RuleTester cases passed");
