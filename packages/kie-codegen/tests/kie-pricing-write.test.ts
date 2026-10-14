import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pricingPaths, writeKiePricingBundles } from "../src/kie-pricing-write.js";

describe("pricing output locations", () => {
  it("keeps node prices in the pack and writes model prices to core", () => {
    expect(pricingPaths(join("packages", "kie-nodes", "src", "kie-manifest.json"))).toEqual({
      byNodeTypePath: join("packages", "kie-nodes", "src", "generated", "kie-node-type-pricing.json"),
      catalogPath: join("packages", "model-pricing", "src", "generated", "kie-unit-pricing.json")
    });
  });

  it("creates both directories when writing a fresh split catalog", async () => {
    const root = await mkdtemp(join(tmpdir(), "nodetool-pricing-"));
    try {
      const paths = pricingPaths(join(root, "kie-nodes", "src", "kie-manifest.json"));
      const bundles = {
        byNodeType: { schemaVersion: 1, writtenAt: "fixture", byNodeType: {} },
        catalog: { schemaVersion: 1, writtenAt: "fixture", prices: {} }
      };
      await writeKiePricingBundles(bundles, paths);
      expect(JSON.parse(await readFile(paths.catalogPath, "utf8"))).toEqual(bundles.catalog);
      expect(JSON.parse(await readFile(paths.byNodeTypePath, "utf8"))).toEqual(bundles.byNodeType);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
