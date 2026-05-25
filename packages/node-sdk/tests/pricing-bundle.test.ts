import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildPricingBundles,
  NODE_TYPE_PRICING_SCHEMA_VERSION,
  writeEmptyPricingBundles,
  writePricingBundles,
  type PricingBundleSpec,
  type PricingOutputPaths,
  type UnitPricing
} from "../src/pricing-bundle.js";

const ENTRY: UnitPricing = {
  unit_price: 0.04,
  billing_unit: "request",
  currency: "USD"
};

describe("buildPricingBundles", () => {
  const writtenAt = "2026-01-01T00:00:00.000Z";

  it("returns both bundles with matching schemaVersion + writtenAt", () => {
    const { byNodeType, catalog } = buildPricingBundles([], {}, writtenAt);
    expect(byNodeType.schemaVersion).toBe(NODE_TYPE_PRICING_SCHEMA_VERSION);
    expect(byNodeType.writtenAt).toBe(writtenAt);
    expect(catalog.schemaVersion).toBe(NODE_TYPE_PRICING_SCHEMA_VERSION);
    expect(catalog.writtenAt).toBe(writtenAt);
  });

  it("emits one entry per priced spec keyed by node_type", () => {
    const specs: PricingBundleSpec[] = [
      { endpointId: "ep-1", nodeType: "fal.image_to_image.A" },
      { endpointId: "ep-2", nodeType: "replicate.image_to_image.B" }
    ];
    const { byNodeType, catalog } = buildPricingBundles(
      specs,
      { "ep-1": ENTRY, "ep-2": ENTRY },
      writtenAt
    );

    expect(byNodeType.byNodeType["fal.image_to_image.A"]).toEqual({
      endpoint_id: "ep-1",
      ...ENTRY
    });
    expect(byNodeType.byNodeType["replicate.image_to_image.B"]).toEqual({
      endpoint_id: "ep-2",
      ...ENTRY
    });
    expect(catalog.prices).toEqual({ "ep-1": ENTRY, "ep-2": ENTRY });
  });

  it("omits specs whose endpointId has no price entry", () => {
    const specs: PricingBundleSpec[] = [
      { endpointId: "ep-1", nodeType: "fal.x.A" },
      { endpointId: "missing", nodeType: "fal.x.B" }
    ];
    const { byNodeType, catalog } = buildPricingBundles(
      specs,
      { "ep-1": ENTRY },
      writtenAt
    );

    expect(Object.keys(byNodeType.byNodeType)).toEqual(["fal.x.A"]);
    expect(Object.keys(catalog.prices)).toEqual(["ep-1"]);
  });
});

describe("write helpers", () => {
  let tmp: string;
  let paths: PricingOutputPaths;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "pricing-bundle-test-"));
    paths = {
      byNodeTypePath: join(tmp, "out/node-type-pricing.json"),
      catalogPath: join(tmp, "out/unit-pricing.json")
    };
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("writePricingBundles creates parent dirs and writes valid JSON", async () => {
    const { byNodeType, catalog } = buildPricingBundles(
      [{ endpointId: "ep-1", nodeType: "fal.x.A" }],
      { "ep-1": ENTRY },
      "2026-01-01T00:00:00.000Z"
    );
    await writePricingBundles({ byNodeType, catalog }, paths);

    const parsedByNodeType = JSON.parse(
      await readFile(paths.byNodeTypePath, "utf8")
    );
    const parsedCatalog = JSON.parse(await readFile(paths.catalogPath, "utf8"));
    expect(parsedByNodeType.byNodeType["fal.x.A"].endpoint_id).toBe("ep-1");
    expect(parsedCatalog.prices["ep-1"]).toEqual(ENTRY);
  });

  it("writeEmptyPricingBundles writes parseable empty stubs", async () => {
    await writeEmptyPricingBundles(paths);
    const parsedByNodeType = JSON.parse(
      await readFile(paths.byNodeTypePath, "utf8")
    );
    expect(parsedByNodeType.schemaVersion).toBe(NODE_TYPE_PRICING_SCHEMA_VERSION);
    expect(parsedByNodeType.byNodeType).toEqual({});
  });
});
