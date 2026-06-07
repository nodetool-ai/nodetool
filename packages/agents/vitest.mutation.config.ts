import { defineConfig } from "vitest/config";

/**
 * Vitest config used only by Stryker mutation testing. It restricts the suite
 * to the fast, hermetic unit tests that cover the mutated pure-logic modules
 * (see `stryker.config.json` `mutate`), so the mutation dry-run stays quick and
 * never touches the network / LLM-backed e2e tests.
 */
export default defineConfig({
  test: {
    include: [
      "tests/json-parser.test.ts",
      "tests/json-parser-hardening.test.ts",
      "tests/utils/remove-base64-images.test.ts",
      "tests/utils/wrap-generators-parallel.test.ts",
      "tests/tool-permissions.test.ts",
      "tests/tool-permissions-hardening.test.ts",
      "tests/tools/control-tool.test.ts",
      "tests/tools/control-tool-hardening.test.ts",
      "tests/tools/calculator-tool.test.ts",
      "tests/tools/calculator-tool-hardening.test.ts"
    ],
    testTimeout: 30000
  }
});
