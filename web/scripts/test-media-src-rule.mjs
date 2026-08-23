#!/usr/bin/env node
// RuleTester fixture for `design-tokens/no-unresolved-media-src`.
//
// The gate it guards is only as good as its ability to fail: a rule that has
// only ever been green is indistinguishable from one that examines nothing.
// The `invalid` cases below are the positive control — each is a locator that
// renders nothing in a browser, and RuleTester throws if the rule lets one
// through. The `valid` cases pin the boundary the other way: `asset://` is a
// legitimate *stored* locator, so passing one to a locator-aware primitive, or
// building one for storage, must stay unflagged.
//
// It runs directly under Node (no Jest): both this script and eslint.design.mjs
// are ESM, sidestepping Jest's always-ESM treatment of `.mjs`. RuleTester
// executes cases synchronously and throws on the first failure, so a mismatch
// exits non-zero. Wired into `npm run lint:design`.
//
// Run: node scripts/test-media-src-rule.mjs

import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { noUnresolvedMediaSrcRule } from "../eslint.design.mjs";

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parser: tsParser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const raw = [{ messageId: "raw" }];

ruleTester.run("no-unresolved-media-src", noUnresolvedMediaSrcRule, {
  valid: [
    // The migrated form: the primitive resolves the locator itself.
    'const a = <ResponsiveImage locator="asset://abc" alt="" />;',
    'const a = <VideoPlayer locator={shot.clip} />;',
    'const a = <AudioPlayback locator={`asset://${id}`} />;',
    // A URL media resolution already produced.
    'const a = <img src={resolvedUrl} alt="" />;',
    'const a = <img src="https://cdn.test/a.png" alt="" />;',
    'const a = <img src="/api/assets/x.png" alt="" />;',
    'const a = <video poster={poster} src={src} />;',
    // Building a locator for storage is not rendering it.
    'const uri = `asset://${asset.id}`;',
    'const ref = { uri: "asset://abc" };',
    // A non-URL attribute holding a locator is fine.
    'const a = <Chip label="asset://abc" />;',
    // A template whose scheme is not a stored locator.
    'const a = <img src={`https://cdn.test/${id}.png`} alt="" />;',
  ],
  invalid: [
    // The defect, in every syntax that reaches an element's URL attribute.
    { code: 'const a = <img src="asset://abc" alt="" />;', errors: raw },
    { code: 'const a = <img src={"asset://abc"} alt="" />;', errors: raw },
    { code: 'const a = <img src={`asset://${id}`} alt="" />;', errors: raw },
    { code: 'const a = <img src={`asset://${id}.png`} alt="" />;', errors: raw },
    { code: 'const a = <video src="asset://abc" />;', errors: raw },
    { code: 'const a = <video poster="asset://abc" />;', errors: raw },
    { code: 'const a = <audio src="asset://abc" />;', errors: raw },
    { code: 'const a = <source src="asset://abc" />;', errors: raw },
    { code: 'const a = <a href="asset://abc">x</a>;', errors: raw },
    // `memory://` is the same class of mistake: an in-run handle, not a URL.
    { code: 'const a = <img src="memory://buf" alt="" />;', errors: raw },
    // Leading whitespace must not smuggle one past the check.
    { code: 'const a = <img src=" asset://abc" alt="" />;', errors: raw },
    // A Box rendered as an <img> is the same defect through MUI.
    {
      code: 'const a = <Box component="img" src="asset://abc" />;',
      errors: raw,
    },
  ],
});

console.log("no-unresolved-media-src: rule fixture passed");
