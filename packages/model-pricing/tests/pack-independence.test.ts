import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import falCatalog from "../src/fal-unit-pricing-catalog.js";
import kieCatalog from "../src/kie-unit-pricing-catalog.js";

describe("pack-independent pricing", () => {
  it("ships nonempty provider catalogs without a dependency on their packs", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8")
    );
    expect(manifest.dependencies["@nodetool-ai/fal-nodes"]).toBeUndefined();
    expect(manifest.dependencies["@nodetool-ai/kie-nodes"]).toBeUndefined();
    expect(Object.keys(falCatalog.prices ?? {}).length).toBeGreaterThan(0);
    expect(Object.keys(kieCatalog.prices ?? {}).length).toBeGreaterThan(0);
  });
});
