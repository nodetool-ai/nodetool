import { describe, expect, it } from "vitest";
import {
  buildPricingBundles,
  FAL_PRICING_SCHEMA_VERSION,
  nodeTypeFor,
  type SpecWithModule
} from "../src/fal-pricing-write.js";
import type { PricingEntry } from "../src/fal-pricing-fetch.js";

function spec(
  endpointId: string,
  className: string,
  moduleName: string
): SpecWithModule {
  return {
    endpointId,
    className,
    moduleName,
    docstring: "",
    tags: [],
    useCases: [],
    inputFields: [],
    outputType: "image",
    outputFields: [],
    enums: []
  };
}

const ENTRY: PricingEntry = {
  unit_price: 0.04,
  billing_unit: "request",
  currency: "USD"
};

describe("nodeTypeFor", () => {
  it("uses the runtime fal-factory convention", () => {
    expect(
      nodeTypeFor(spec("fal-ai/flux-pro/kontext", "FluxKontextPro", "image_to_image"))
    ).toBe("fal.image_to_image.FluxKontextPro");
  });
});

describe("buildPricingBundles", () => {
  const writtenAt = "2026-01-01T00:00:00.000Z";

  it("emits both bundles with the matching schema version", () => {
    const { byNodeType, catalog } = buildPricingBundles([], {}, writtenAt);
    expect(byNodeType.schemaVersion).toBe(FAL_PRICING_SCHEMA_VERSION);
    expect(catalog.schemaVersion).toBe(FAL_PRICING_SCHEMA_VERSION);
    expect(byNodeType.writtenAt).toBe(writtenAt);
    expect(catalog.writtenAt).toBe(writtenAt);
  });

  it("maps each priced spec to its node_type and includes endpoint_id", () => {
    const specs: SpecWithModule[] = [
      spec("fal-ai/flux-pro/kontext", "FluxKontextPro", "image_to_image")
    ];
    const { byNodeType, catalog } = buildPricingBundles(
      specs,
      { "fal-ai/flux-pro/kontext": ENTRY },
      writtenAt
    );

    expect(byNodeType.byNodeType).toEqual({
      "fal.image_to_image.FluxKontextPro": {
        endpoint_id: "fal-ai/flux-pro/kontext",
        ...ENTRY
      }
    });
    expect(catalog.prices).toEqual({
      "fal-ai/flux-pro/kontext": ENTRY
    });
  });

  it("omits specs without pricing data rather than emitting partial entries", () => {
    const specs: SpecWithModule[] = [
      spec("fal-ai/flux-pro/kontext", "FluxKontextPro", "image_to_image"),
      spec("fal-ai/unknown/model", "UnknownModel", "image_to_image")
    ];

    const { byNodeType, catalog } = buildPricingBundles(
      specs,
      { "fal-ai/flux-pro/kontext": ENTRY },
      writtenAt
    );

    expect(Object.keys(byNodeType.byNodeType)).toEqual([
      "fal.image_to_image.FluxKontextPro"
    ]);
    expect(Object.keys(catalog.prices)).toEqual(["fal-ai/flux-pro/kontext"]);
  });

  it("returns empty maps when nothing is priced", () => {
    const { byNodeType, catalog } = buildPricingBundles(
      [spec("fal-ai/x", "X", "image_to_image")],
      {},
      writtenAt
    );
    expect(byNodeType.byNodeType).toEqual({});
    expect(catalog.prices).toEqual({});
  });
});
