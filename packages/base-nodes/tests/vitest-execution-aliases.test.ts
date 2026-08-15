/**
 * Guards the `@nodetool-ai/execution` aliases in this package's vitest config.
 *
 * Vite matches object-form aliases by prefix, so a subpath with no alias of its
 * own falls through to the bare `@nodetool-ai/execution` entry and resolves to
 * `execution/src/index.ts/<subpath>` — a path inside a file, which fails at
 * transform time with `ENOTDIR: not a directory`. Adding `./js-script-debug` to
 * the execution exports map without adding the matching alias here broke the
 * `test:integration` leg that way, and the error never names the missing alias.
 *
 * Two rules, both mechanical: every exported subpath needs an alias, and each
 * one must be declared before the bare package alias.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const PACKAGE = "@nodetool-ai/execution";

const executionExports = (): string[] => {
  const pkg = JSON.parse(
    readFileSync(resolve(__dirname, "../../execution/package.json"), "utf8")
  ) as { exports?: Record<string, unknown> };
  return Object.keys(pkg.exports ?? {})
    .filter((key) => key !== ".")
    .map((key) => `${PACKAGE}/${key.replace(/^\.\//, "")}`);
};

const configSource = (): string =>
  readFileSync(resolve(__dirname, "../vitest.config.ts"), "utf8");

describe("vitest execution aliases", () => {
  it("aliases every execution subpath export", () => {
    const subpaths = executionExports();
    // A registry that matched nothing would pass every assertion below.
    expect(subpaths.length).toBeGreaterThan(0);

    const source = configSource();
    const missing = subpaths.filter(
      (specifier) => !source.includes(`"${specifier}"`)
    );

    expect(missing).toEqual([]);
  });

  it("declares each subpath alias before the bare package alias", () => {
    const source = configSource();
    const bare = source.indexOf(`"${PACKAGE}":`);
    expect(bare).toBeGreaterThan(-1);

    const shadowed = executionExports().filter((specifier) => {
      const at = source.indexOf(`"${specifier}"`);
      return at > bare;
    });

    expect(shadowed).toEqual([]);
  });
});
