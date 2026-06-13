import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildPricingBundles,
  FAL_PRICING_SCHEMA_VERSION,
  nodeTypeFor,
  preserveOrWriteEmptyPricingBundles,
  pricingBundleFilesExist,
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

describe("preserveOrWriteEmptyPricingBundles", () => {
  it("preserves existing bundles when files are already present", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fal-pricing-"));
    const paths = {
      byNodeTypePath: join(dir, "fal-node-type-pricing.json"),
      catalogPath: join(dir, "fal-unit-pricing.json")
    };

    try {
      await writeFile(
        paths.byNodeTypePath,
        JSON.stringify({ schemaVersion: 1, writtenAt: "keep-me", byNodeType: { a: 1 } })
      );
      await writeFile(
        paths.catalogPath,
        JSON.stringify({ schemaVersion: 1, writtenAt: "keep-me", prices: { b: 1 } })
      );

      expect(await pricingBundleFilesExist(paths)).toBe(true);
      expect(await preserveOrWriteEmptyPricingBundles(paths)).toBe("preserved");

      const byNodeType = JSON.parse(await readFile(paths.byNodeTypePath, "utf8"));
      expect(byNodeType.writtenAt).toBe("keep-me");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("writes empty stubs only when bundles are missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fal-pricing-"));
    const paths = {
      byNodeTypePath: join(dir, "fal-node-type-pricing.json"),
      catalogPath: join(dir, "fal-unit-pricing.json")
    };

    try {
      expect(await pricingBundleFilesExist(paths)).toBe(false);
      expect(await preserveOrWriteEmptyPricingBundles(paths)).toBe("stubbed");

      const byNodeType = JSON.parse(await readFile(paths.byNodeTypePath, "utf8"));
      const catalog = JSON.parse(await readFile(paths.catalogPath, "utf8"));
      expect(byNodeType.byNodeType).toEqual({});
      expect(catalog.prices).toEqual({});
      expect(byNodeType.writtenAt).toBe(new Date(0).toISOString());
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("preserves an existing bundle when only the other file is missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fal-pricing-partial-"));
    const paths = {
      byNodeTypePath: join(dir, "fal-node-type-pricing.json"),
      catalogPath: join(dir, "fal-unit-pricing.json")
    };

    try {
      await writeFile(
        paths.byNodeTypePath,
        JSON.stringify({ schemaVersion: 1, writtenAt: "keep-me", byNodeType: { a: 1 } })
      );

      expect(await preserveOrWriteEmptyPricingBundles(paths)).toBe("partial");

      const byNodeType = JSON.parse(await readFile(paths.byNodeTypePath, "utf8"));
      const catalog = JSON.parse(await readFile(paths.catalogPath, "utf8"));
      expect(byNodeType.writtenAt).toBe("keep-me");
      expect(catalog.prices).toEqual({});
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
