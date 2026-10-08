/**
 * A warm pack pointer answers without bundling.
 *
 * Every server start compiles every npm module of every installed pack. The
 * pointer already re-verifies what the entry was built from, so a start with
 * nothing changed must not pay for esbuild again.
 */

import { afterAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CompiledModuleCache } from "../src/cache.js";
import { cleanup, materializePack } from "./fixtures.js";

const bundleCalls = vi.hoisted(() => ({ count: 0 }));

vi.mock("../src/bundle.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/bundle.js")>();
  return {
    ...original,
    bundleNpmModule: async (
      ...args: Parameters<typeof original.bundleNpmModule>
    ) => {
      bundleCalls.count += 1;
      return original.bundleNpmModule(...args);
    }
  };
});

const { compileNpmModule } = await import("../src/compile.js");

const workspace = mkdtempSync(join(tmpdir(), "nodetool-warm-pointer-test-"));

afterAll(() => cleanup(workspace));

describe("compileNpmModule with a warm pack pointer", () => {
  it("returns the cached artifact without bundling, and bundles again once an input moves", async () => {
    const packDir = materializePack("clean", workspace);
    const cache = new CompiledModuleCache(join(workspace, "cache"));

    const first = await compileNpmModule({ packDir, npmName: "fixture-clean", cache });
    expect(first.cached).toBe(false);
    expect(bundleCalls.count).toBe(1);

    const warm = await compileNpmModule({ packDir, npmName: "fixture-clean", cache });
    expect(warm.cached).toBe(true);
    expect(warm.key).toBe(first.key);
    expect(warm.outcome).toEqual(first.outcome);
    expect(bundleCalls.count).toBe(1);

    const dependency = join(packDir, "node_modules", "fixture-clean", "index.js");
    writeFileSync(dependency, `${readFileSync(dependency, "utf8")}\nexport const moved = 1;\n`);
    const changed = await compileNpmModule({ packDir, npmName: "fixture-clean", cache });
    expect(changed.cached).toBe(false);
    expect(changed.key).not.toBe(first.key);
    expect(bundleCalls.count).toBe(2);
  });
});
