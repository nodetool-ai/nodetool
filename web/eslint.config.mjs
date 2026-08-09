import { fixupConfigRules } from "@eslint/compat";
import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";
import {
  designTokenIgnores,
  designTokensPlugin,
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
      // The "zero any in web/src" target (DEVELOPMENT_STANDARDS §1) is met, so
      // the rule that used to warn about the backlog now blocks new `any`.
      "@typescript-eslint/no-explicit-any": "error",
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
    plugins: { "design-tokens": designTokensPlugin },
    rules: {
      "no-restricted-imports": noRestrictedImports,
      "no-restricted-syntax": noRestrictedSyntax,
      "design-tokens/no-raw-mui": "error",
    },
  },
  // The one `any` left in web/src: PropertyProps' default type argument, which
  // the editor registry in PropertyInput.resolver depends on. The doc comment
  // on the type says what removing it would take.
  {
    files: ["src/components/node/PropertyInput.types.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  // Mocks and partial fixtures still use `any`; the src rule above is the gate.
  {
    files: [
      "**/__tests__/**/*.{ts,tsx}",
      "**/__mocks__/**/*.{ts,tsx}",
      "**/*.test.{ts,tsx}",
      "src/setupTests.ts",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
];
