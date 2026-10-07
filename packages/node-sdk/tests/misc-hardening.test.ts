// @ts-nocheck
/**
 * Mutation-hardening for the smaller behavioural helpers:
 * class-name-to-title numeric merging and pricing-bundle file output.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { classNameToTitle } from "../src/class-name-to-title.js";
import {
  buildPricingBundles,
  writePricingBundles,
  writeEmptyPricingBundles,
  NODE_TYPE_PRICING_SCHEMA_VERSION
} from "../src/pricing-bundle.js";

describe("classNameToTitle numeric merge boundaries", () => {
  it("merges multi-digit numeric tokens (not just single digits)", () => {
    expect(classNameToTitle("Veo_10_2")).toBe("Veo 10.2");
    expect(classNameToTitle("Model_100_25")).toBe("Model 100.25");
  });

  it("does not merge a number that is separated from another by a word", () => {
    expect(classNameToTitle("Flux_2_Klein_4B")).toBe("Flux 2 Klein 4B");
  });

  it("returns an empty string for empty input", () => {
    expect(classNameToTitle("")).toBe("");
  });
});

describe("pricing bundles file output", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pricing-h-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes pretty JSON terminated by a trailing newline", async () => {
    const bundles = buildPricingBundles(
      [{ endpointId: "ep1", nodeType: "fal.X" }],
      { ep1: { unit_price: 0.05, billing_unit: "request", currency: "USD" } },
      "2026-01-01T00:00:00.000Z"
    );
    const byNodeTypePath = join(dir, "sub", "by-node-type.json");
    const catalogPath = join(dir, "sub", "catalog.json");
    await writePricingBundles(bundles, { byNodeTypePath, catalogPath });

    const rawByNodeType = await readFile(byNodeTypePath, "utf8");
    expect(rawByNodeType).toBe(JSON.stringify(bundles.byNodeType, null, 2) + "\n");
    const rawCatalog = await readFile(catalogPath, "utf8");
    expect(rawCatalog).toBe(JSON.stringify(bundles.catalog, null, 2) + "\n");

    expect(JSON.parse(rawByNodeType).byNodeType["fal.X"]).toEqual({
      endpoint_id: "ep1",
      unit_price: 0.05,
      billing_unit: "request",
      currency: "USD"
    });
    expect(JSON.parse(rawCatalog).prices.ep1).toEqual({
      unit_price: 0.05,
      billing_unit: "request",
      currency: "USD"
    });
  });

  it("writes empty bundles at the unix epoch", async () => {
    const byNodeTypePath = join(dir, "by.json");
    const catalogPath = join(dir, "cat.json");
    await writeEmptyPricingBundles({ byNodeTypePath, catalogPath });
    const byNodeType = JSON.parse(await readFile(byNodeTypePath, "utf8"));
    expect(byNodeType).toEqual({
      schemaVersion: NODE_TYPE_PRICING_SCHEMA_VERSION,
      writtenAt: "1970-01-01T00:00:00.000Z",
      byNodeType: {}
    });
    const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
    expect(catalog).toEqual({
      schemaVersion: NODE_TYPE_PRICING_SCHEMA_VERSION,
      writtenAt: "1970-01-01T00:00:00.000Z",
      prices: {}
    });
  });
});
