import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const source = pathToFileURL(resolve(import.meta.dirname, "../src/pack-source.ts")).href;

function runWithoutPacks(body: string) {
  return spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", `
    import assert from "node:assert/strict";
    import { registerHooks } from "node:module";
    import { readCatalogIndex } from "@nodetool-ai/node-catalog";
    import { NodeRegistry } from "@nodetool-ai/node-sdk";
    const hidden = new Set(["@nodetool-ai/server", "@nodetool-ai/base-nodes", ...readCatalogIndex().packs.flatMap(pack => [pack.npm.name, ...pack.provides])]);
    let attempts = 0;
    registerHooks({ resolve(specifier, context, next) {
      if ([...hidden].some(name => specifier === name || specifier.startsWith(name + "/"))) {
        attempts += 1;
        const error = new Error("Hidden node pack: " + specifier);
        error.code = "ERR_MODULE_NOT_FOUND";
        throw error;
      }
      return next(specifier, context);
    } });
    const { createCatalogPackSource, loadBundledPackSource, setDefaultPackSource } = await import(${JSON.stringify(source)});
    ${body}
  `], { cwd: resolve(import.meta.dirname, "../../.."), encoding: "utf8", timeout: 30000 });
}

describe("standalone catalog pack source", () => {
  it("boots without private server or node packs and keeps catalog diagnostics", () => {
    const child = runWithoutPacks(`
      const source = await loadBundledPackSource();
      const registry = new NodeRegistry();
      await source.register(registry, {});
      assert.equal(registry.availability("nodetool.constant.Integer"), "catalog");
      assert.equal(registry.has("nodetool.constant.Integer"), false);
      assert.equal(await loadBundledPackSource(), source);
      const { BUILTIN_NODE_PACKS } = await import("@nodetool-ai/protocol");
      const fal = BUILTIN_NODE_PACKS.find(pack => pack.id === "fal");
      assert.equal(source.unavailableReason(fal, {}), "node pack is not installed");
      await source.registerProviders({});
      assert.ok(attempts > 0);
      await source.setEnabled(registry, "huggingface", false);
      assert.equal(registry.getMetadata("huggingface.text.TextGeneration"), undefined);
      await source.setEnabled(registry, "huggingface", true);
      assert.ok(registry.listMetadata().some(node => node.node_type.startsWith("huggingface.")));
    `);
    expect(child.status, child.stderr).toBe(0);
  });

  it("preserves an injected bundled source without resolving private packages", () => {
    const child = runWithoutPacks(`
      const injected = { register() {}, setEnabled() {}, unavailableReason() {}, registerProviders() {} };
      setDefaultPackSource(injected);
      assert.equal(await loadBundledPackSource(), injected);
      assert.equal(attempts, 0);
    `);
    expect(child.status, child.stderr).toBe(0);
  });

  it("propagates initialization failures of a resolved pack", () => {
    const child = runWithoutPacks(`
      registerHooks({ resolve(specifier, context, next) {
        if (specifier === '@nodetool-ai/core-nodes') {
          return { url: 'data:text/javascript,throw%20new%20Error(%22resolved%20pack%20initialization%20failure%22)', shortCircuit: true };
        }
        return next(specifier, context);
      } });
      const source = createCatalogPackSource();
      await assert.rejects(source.register(new NodeRegistry(), {}), /resolved pack initialization failure/);
    `);
    expect(child.status, child.stderr).toBe(0);
  });
});
