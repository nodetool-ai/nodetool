// Minimal ESLint config for the design-system gate.
//
// Used by `npm run lint:design` (wired into the standard `npm run lint`). It
// deliberately does NOT extend eslint:recommended / typescript-eslint, so the
// only diagnostics are the warn-level design-token + primitives guardrails —
// the run always exits 0 and never drags in the recommended-rule backlog that
// `lint:eslint` carries. See eslint.design.mjs for the shared rule definitions.

import tsParser from "@typescript-eslint/parser";
import {
  designTokenIgnores,
  noRestrictedImports,
  noRestrictedSyntax,
} from "./eslint.design.mjs";

// Source files carry inline `// eslint-disable … <rule>` comments for rules
// that this lean config does not load (e.g. react-hooks/exhaustive-deps,
// @typescript-eslint/no-require-imports). Without the rule registered, ESLint
// errors on the directive ("Definition for rule … was not found"). Register
// the referenced rules as no-ops so the directives resolve harmlessly. Add a
// name here if a new disable directive ever trips the gate.
const noopRule = { create: () => ({}) };
const directiveStubs = {
  "react-hooks": { rules: { "exhaustive-deps": noopRule } },
  "@typescript-eslint": { rules: { "no-require-imports": noopRule } },
};

export default [
  {
    ignores: ["dist/**/*", "build/**/*", "coverage/**/*"],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: designTokenIgnores,
    plugins: directiveStubs,
    // This gate only reports the design-token guardrails; it is not the place
    // to flag unused disable directives for rules it intentionally stubs out.
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2021,
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
        project: null,
      },
    },
    rules: {
      "react-hooks/exhaustive-deps": "off",
      "@typescript-eslint/no-require-imports": "off",
      "no-restricted-imports": noRestrictedImports,
      "no-restricted-syntax": noRestrictedSyntax,
    },
  },
];
