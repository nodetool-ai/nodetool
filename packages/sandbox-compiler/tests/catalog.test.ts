/**
 * From a config-only pack to a module the guest actually runs.
 *
 * The end-to-end case is the one that matters: a pack that authored no code at
 * all declares an npm dependency, the compiler produces the module, discovery
 * takes it as a graph file, the catalog resolves it for execution, and the M1
 * loader imports it inside QuickJS. Everything between the manifest and the
 * `import` is exercised, with nothing stubbed.
 */

import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createSandboxModuleCatalog,
  discoverSandboxPack
} from "@nodetool-ai/node-sdk";
import { runInSandbox } from "@nodetool-ai/agents";

import { CompiledModuleCache } from "../src/cache.js";
import { compileDiscoveries, createCompiledNpmLookup } from "../src/catalog.js";
import { cleanup, materializePack } from "./fixtures.js";

const workspace = mkdtempSync(join(tmpdir(), "nodetool-catalog-test-"));
const cache = new CompiledModuleCache(join(workspace, "cache"));

afterAll(() => cleanup(workspace));

/** Discover a fixture pack twice: once to find its npm entries, once with them compiled. */
async function discoverCompiled(name: string) {
  const packDir = materializePack(name, join(workspace, name));
  const first = discoverSandboxPack(packDir);
  if (first === undefined) throw new Error(`${name} is not a sandbox pack`);
  const reports = await compileDiscoveries([first], { cache });
  const second = discoverSandboxPack(packDir, { compiled: createCompiledNpmLookup(reports) });
  if (second === undefined) throw new Error(`${name} stopped being a sandbox pack`);
  return { packDir, uncompiled: first, discovery: second, reports };
}

describe("npm modules through discovery", () => {
  it("reports pending-compile before anything has compiled", async () => {
    const { uncompiled } = await discoverCompiled("clean");
    const status = uncompiled.statuses.find((entry) => entry.code === "pending-compile");
    expect(status?.status).toBe("skipped");
    expect(status?.message).toContain("nodetool packs compile");
    expect(uncompiled.modules[0]?.source).toBeUndefined();
  });

  it("joins the source graph once compiled", async () => {
    const { discovery } = await discoverCompiled("clean");
    const module = discovery.modules[0];
    expect(module?.specifier).toBe("@fixture/sandbox-clean");
    expect(module?.source).toContain("slugify");
    expect(discovery.graph.some((file) => file.id === "npm:fixture-clean")).toBe(true);
    expect(discovery.statuses.some((entry) => entry.code === "npm-module-compiled")).toBe(true);
    expect(discovery.statuses.some((entry) => entry.code === "pending-compile")).toBe(false);
  });

  it("gives a compiled module a digest the placeholder never had", async () => {
    const { uncompiled, discovery } = await discoverCompiled("clean");
    expect(discovery.modules[0]?.digest).not.toBe(uncompiled.modules[0]?.digest);
    expect(discovery.digest).not.toBe(uncompiled.digest);
    expect(discovery.modules[0]?.digest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("carries every skip reason into the pack's diagnostics", async () => {
    for (const [fixture, code] of [
      ["builtin", "npm-module-builtin-import"],
      ["process-hard", "npm-module-forbidden-global"],
      ["throwing", "npm-module-probe-failed"]
    ] as const) {
      const { discovery } = await discoverCompiled(fixture);
      const status = discovery.statuses.find((entry) => entry.code === code);
      expect(status?.status, `${fixture} should be skipped, not failed`).toBe("skipped");
      expect(discovery.modules[0]?.source).toBeUndefined();
    }
  });

  it("admits a feature-detected module and records the warning", async () => {
    const { discovery } = await discoverCompiled("process-detected");
    expect(discovery.modules[0]?.source).toBeDefined();
    const warning = discovery.statuses.find((entry) => entry.code === "npm-module-warning");
    expect(warning?.status).toBe("warning");
    expect(warning?.message).toContain("process");
  });
});

describe("end to end through the M1 loader", () => {
  it("resolves a config-only pack's npm module and runs it in the guest", async () => {
    const { discovery } = await discoverCompiled("clean");
    const catalog = createSandboxModuleCatalog([discovery]);
    expect(catalog.summaries().map((summary) => summary.specifier)).toEqual([
      "@fixture/sandbox-clean"
    ]);

    const resolution = catalog.resolveForExecution([
      { specifier: "@fixture/sandbox-clean", contentDigest: discovery.modules[0]?.digest }
    ]);
    expect(resolution.statuses).toEqual([]);
    expect(resolution.modules).toHaveLength(1);

    const result = await runInSandbox({
      code: `
        import { slugify, sum } from "@fixture/sandbox-clean";
        return { slug: slugify("  Hello Sandbox World "), total: sum([1, 2, 3]) };
      `,
      modules: resolution
    });
    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({ slug: "hello-sandbox-world", total: 6 });
  });

  it("reports drift when the compiled module no longer matches the saved digest", async () => {
    const { discovery } = await discoverCompiled("clean");
    const catalog = createSandboxModuleCatalog([discovery]);
    const resolution = catalog.resolveForExecution([
      { specifier: "@fixture/sandbox-clean", contentDigest: "0".repeat(64) }
    ]);
    expect(resolution.statuses[0]?.code).toBe("content-digest-mismatch");
  });
});
