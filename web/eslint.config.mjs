import { fixupConfigRules } from "@eslint/compat";
import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";
import {
  designTokenIgnores,
  noRestrictedImports,
  noRestrictedSyntax,
} from "./eslint.design.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default [
  ...fixupConfigRules(
    compat.extends(
      "eslint:recommended",
      "plugin:@typescript-eslint/recommended"
    )
  ),
  {
    ignores: [
      "dist/**/*",
      "build/**/*",
      "coverage/**/*",
      "jest.config.ts",
      "vite.config.ts",
    ],
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2021,
      sourceType: "module",

      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
        tsconfigRootDir: __dirname,
        project: null,
      },
    },

    settings: {
      react: {
        version: "detect",
      },
    },

    rules: {
      // Surface remaining `any` for incremental cleanup toward the documented
      // "zero any in web/src" target (DEVELOPMENT_STANDARDS §1). Warn, not
      // error, so the legacy backlog and intentional generic-constraint idioms
      // don't break lint.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "no-console": "off",
    },
  },
  // Design-system guardrails (primitives-first + design tokens), shared with
  // the dedicated `npm run lint:design` gate. Defined in eslint.design.mjs so
  // both configs stay in sync. All warn-level; see docs/DESIGN.md.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: designTokenIgnores,
    rules: {
      "no-restricted-imports": noRestrictedImports,
      "no-restricted-syntax": noRestrictedSyntax,
    },
  },
];
