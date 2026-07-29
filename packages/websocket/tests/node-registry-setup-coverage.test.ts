import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import { BUILTIN_NODE_PACKS } from "@nodetool-ai/protocol";
import {
  registerBuiltInNodes,
  applyProductionNodePolicy,
  bootstrapNodeRegistry
} from "../src/node-registry-setup.js";

const PROD_PREFIXES = ["lib.tensorflow.", "lib.ocr.", "transformers.", "vector."];

function allEnabled(): Record<string, boolean> {
  return Object.fromEntries(BUILTIN_NODE_PACKS.map((p) => [p.id, true]));
}

describe("applyProductionNodePolicy", () => {
  const original = process.env["NODETOOL_ENV"];

  beforeEach(() => {
    delete process.env["NODETOOL_ENV"];
  });

  afterEach(() => {
    if (original === undefined) delete process.env["NODETOOL_ENV"];
    else process.env["NODETOOL_ENV"] = original;
  });

  it("is a no-op outside production", () => {
    const registry = new NodeRegistry();
    registerBuiltInNodes(registry, { enabledOverrides: allEnabled() });
    const before = registry.list().length;
    applyProductionNodePolicy(registry);
    expect(registry.list().length).toBe(before);
  });

  it("drops optional prod-skipped node types when NODETOOL_ENV=production", () => {
    // Register with transformers-js enabled *before* flipping to production so
    // the prod-skipped node types actually exist, then let the policy prune them.
    const registry = new NodeRegistry();
    registerBuiltInNodes(registry, { enabledOverrides: allEnabled() });

    const skippedBefore = registry
      .list()
      .filter((t) => PROD_PREFIXES.some((p) => t.startsWith(p)));
    expect(skippedBefore.length).toBeGreaterThan(0);

    process.env["NODETOOL_ENV"] = "production";
    const logged: string[] = [];
    applyProductionNodePolicy(registry, {
      info: (m) => logged.push(m),
      warn: () => {}
    });

    for (const t of registry.list()) {
      expect(PROD_PREFIXES.some((p) => t.startsWith(p))).toBe(false);
    }
    // Every removed type produced an "Unregistered … in production" log line.
    expect(logged.length).toBe(skippedBefore.length);
    expect(logged[0]).toMatch(/Unregistered .* in production/);
  });
});

describe("registerBuiltInNodes in production", () => {
  const original = process.env["NODETOOL_ENV"];

  afterEach(() => {
    if (original === undefined) delete process.env["NODETOOL_ENV"];
    else process.env["NODETOOL_ENV"] = original;
  });

  it("skips the transformers-js pack entirely in production", () => {
    process.env["NODETOOL_ENV"] = "production";
    const registry = new NodeRegistry();
    registerBuiltInNodes(registry, { enabledOverrides: allEnabled() });
    expect(registry.list().some((t) => t.startsWith("transformers."))).toBe(
      false
    );
    // Base pack still registers, so the registry is non-empty.
    expect(registry.list().some((t) => t.startsWith("nodetool."))).toBe(true);
  });
});

describe("bootstrapNodeRegistry", () => {
  const original = process.env["NODETOOL_ENV"];

  afterEach(() => {
    if (original === undefined) delete process.env["NODETOOL_ENV"];
    else process.env["NODETOOL_ENV"] = original;
  });

  it("builds a populated registry without loading external packs", async () => {
    delete process.env["NODETOOL_ENV"];
    const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nt-meta-"));
    const log = { info: vi.fn(), warn: vi.fn() };

    const registry = await bootstrapNodeRegistry({
      loadPacks: false,
      metadataRoots: [emptyRoot],
      metadataMaxDepth: 1,
      log
    });

    expect(registry).toBeInstanceOf(NodeRegistry);
    // Built-in base nodes are always registered.
    expect(registry.list().some((t) => t.startsWith("nodetool."))).toBe(true);
  });
});
