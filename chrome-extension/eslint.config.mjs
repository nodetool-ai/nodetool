import eslint from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";

export default [
  eslint.configs.recommended,
  {
    ignores: ["dist/**", "node_modules/**"]
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      "@typescript-eslint": tseslint,
      "react": reactPlugin,
      "react-hooks": reactHooksPlugin
    },
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: "module",
        ecmaFeatures: {
          jsx: true
        }
      },
      globals: {
        React: "readonly",
        chrome: "readonly",
        window: "readonly",
        document: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
        WebSocket: "readonly",
        fetch: "readonly",
        Uint8Array: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        HTMLElement: "readonly",
        HTMLDivElement: "readonly",
        HTMLButtonElement: "readonly",
        Date: "readonly",
        Math: "readonly",
        Error: "readonly",
        Blob: "readonly",
        BlobPart: "readonly",
        BinaryType: "readonly",
        MessageEvent: "readonly",
        Event: "readonly",
        CloseEvent: "readonly",
        HeadersInit: "readonly",
        ArrayBuffer: "readonly",
        Object: "readonly",
        Promise: "readonly",
        JSON: "readonly",
        String: "readonly"
      }
    },
    settings: {
      react: {
        version: "18.2"
      }
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "react/no-unknown-property": ["error", { ignore: ["css"] }],
      "no-console": "off"
    }
  }
];
