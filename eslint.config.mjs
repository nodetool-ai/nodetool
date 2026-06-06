import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default [
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      "packages/*/dist/**",
      "packages/*/node_modules/**",
      "packages/*/src/generated/**",
      "web/**",
      "electron/**",
      "mobile/**",
    ],
  },
  {
    // Node scripts (build, dev, release, etc.) get Node globals (process,
    // __dirname, Buffer, setTimeout, ...). Without this, ESLint flags them
    // as no-undef even though Node provides them.
    files: ["scripts/**/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    files: ["packages/*/src/**/*.{ts,tsx,js,jsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "@typescript-eslint/no-unsafe-function-type": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "prefer-const": "error",
      "no-useless-assignment": "warn",
      "preserve-caught-error": "off",
      "require-yield": "warn",
    },
  },
];
