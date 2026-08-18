/**
 * `network-guard.ts` must stay importable in a browser bundle.
 *
 * It is reachable from `js-sandbox.ts`, which the workflow-runner harness and
 * the in-browser runner bundle with Vite. A static `node:*` import there does
 * not fail a typecheck, a lint, or any Node test — it fails the *bundle*, and
 * the whole harness page then never boots. That is how it shipped: the browser
 * E2E leg caught it, after the merge queue had already let it through.
 *
 * The Node-only half loads through `importNodeBuiltin`, which answers null off
 * Node. This test pins that, cheaply, where every suite runs.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "network-guard.ts"
);

describe("network-guard stays bundleable for the browser", () => {
  it("imports no node builtin at the top level", async () => {
    const source = await readFile(SRC, "utf8");
    const statik = [...source.matchAll(/^import[^;]*?from\s+"([^"]+)";/gm)].map(
      (match) => match[1]
    );
    expect(statik.filter((specifier) => specifier.startsWith("node:"))).toEqual(
      []
    );
  });
});
