import { fixupConfigRules } from "@eslint/compat";
import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all
});

export default [
  ...fixupConfigRules(
    compat.extends(
      "eslint:recommended",
      "plugin:react/recommended",
      "plugin:@typescript-eslint/recommended",
      "plugin:react-hooks/recommended"
    )
  ),
  {
    ignores: ["src/api.ts"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2021,
      sourceType: "module",

      parserOptions: {
        ecmaFeatures: {
          jsx: true
        },

        project: "./tsconfig.json"
      }
    },

    settings: {
      react: {
        version: "detect"
      }
    },

    rules: {
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",

      "react/no-unknown-property": [
        "error",
        {
          ignore: ["css"]
        }
      ],

      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-unused-vars": "off",

      "no-console": "off",
      "react/jsx-uses-react": "off",
      "react/jsx-uses-vars": "warn",
      "react/jsx-no-target-blank": "warn",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn"
    }
  }
];
