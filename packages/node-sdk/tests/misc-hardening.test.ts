// @ts-nocheck
/**
 * Mutation-hardening for the smaller behavioural helpers:
 * class-name-to-title numeric merging, package-registry-client validation,
 * and pricing-bundle file output.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { classNameToTitle } from "../src/class-name-to-title.js";
import { fetchAvailablePackages } from "../src/package-registry-client.js";
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

describe("fetchAvailablePackages validation", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  const mockJson = (body: unknown) => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as typeof fetch;
  };

  it("returns a top-level array of valid packages", async () => {
    mockJson([{ name: "a", repo_id: "o/a" }]);
    expect(await fetchAvailablePackages()).toEqual([{ name: "a", repo_id: "o/a" }]);
  });

  it("extracts packages from a { packages: [...] } wrapper", async () => {
    mockJson({ packages: [{ name: "b", repo_id: "o/b", description: "d" }] });
    expect(await fetchAvailablePackages()).toEqual([
      { name: "b", repo_id: "o/b", description: "d" }
    ]);
  });

  it("drops entries missing name or repo_id", async () => {
    mockJson([
      { name: "ok", repo_id: "o/ok" },
      { name: "no-repo" },
      { repo_id: "o/no-name" },
      { name: 1, repo_id: "o/x" }
    ]);
    expect(await fetchAvailablePackages()).toEqual([{ name: "ok", repo_id: "o/ok" }]);
  });

  it("keeps an entry with a valid string description", async () => {
    mockJson([{ name: "a", repo_id: "o/a", description: "fine" }]);
    expect(await fetchAvailablePackages()).toEqual([
      { name: "a", repo_id: "o/a", description: "fine" }
    ]);
  });

  it("drops an entry whose description is the wrong type", async () => {
    mockJson([{ name: "a", repo_id: "o/a", description: 42 }]);
    expect(await fetchAvailablePackages()).toEqual([]);
  });

  it("drops null, scalar and array entries", async () => {
    mockJson([null, 42, "str", [1, 2], { name: "ok", repo_id: "o/ok" }]);
    expect(await fetchAvailablePackages()).toEqual([{ name: "ok", repo_id: "o/ok" }]);
  });

  it.each([{ nope: true }, null, 42, "string"])(
    "returns [] for a non-array, non-packages response (%j)",
    async (body) => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockJson(body);
      expect(await fetchAvailablePackages()).toEqual([]);
      errorSpy.mockRestore();
    }
  );

  it("returns [] for a non-2xx response even with a valid array body", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify([{ name: "a", repo_id: "o/a" }]), {
          status: 500,
          statusText: "Server Error"
        })
    ) as typeof fetch;
    expect(await fetchAvailablePackages()).toEqual([]);
    errorSpy.mockRestore();
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
