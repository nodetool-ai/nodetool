import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchFalUnitPricingMap } from "../src/fetch-fal-unit-pricing.js";

describe("fetchFalUnitPricingMap", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns empty map when apiKey is missing", async () => {
    const map = await fetchFalUnitPricingMap(["fal-ai/flux/dev"], undefined);
    expect(map.size).toBe(0);
  });

  it("returns empty map when endpoint list is empty", async () => {
    const map = await fetchFalUnitPricingMap([], "test-key");
    expect(map.size).toBe(0);
  });

  it("parses prices from a successful response", async () => {
    const fakeResponse = {
      prices: [
        {
          endpoint_id: "fal-ai/flux/dev",
          unit_price: 0.025,
          unit: "megapixels",
          currency: "USD",
        },
      ],
      next_cursor: null,
      has_more: false,
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => fakeResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const map = await fetchFalUnitPricingMap(
      ["fal-ai/flux/dev", "fal-ai/flux/dev"],
      "secret",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(map.size).toBe(1);
    expect(map.get("fal-ai/flux/dev")).toEqual({
      endpointId: "fal-ai/flux/dev",
      unitPrice: 0.025,
      billingUnit: "megapixels",
      currency: "USD",
    });
  });

  it("logs progress every 50 pricing rows from successful responses", async () => {
    const prevCooldown = process.env.FAL_PRICING_POST_CATALOG_COOLDOWN_MS;
    process.env.FAL_PRICING_POST_CATALOG_COOLDOWN_MS = "0";
    const ids = Array.from({ length: 50 }, (_, i) => `fal-ai/model-${i}`);
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      const batchIds = new URL(url).searchParams.getAll("endpoint_id");
      const prices = batchIds.map((endpoint_id) => ({
        endpoint_id,
        unit_price: 0.01,
        unit: "image",
        currency: "USD",
      }));
      return {
        ok: true,
        json: async () => ({
          prices,
          next_cursor: null,
          has_more: false,
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {
      /* silence progress logs in test */
    });

    vi.useFakeTimers();

    try {
      const done = fetchFalUnitPricingMap(ids, "secret", { mode: "pricing-only" });
      await vi.runAllTimersAsync();
      await done;
      expect(
        logSpy.mock.calls.some((c) =>
          String(c[0]).includes("FAL unit pricing: 50 rows fetched"),
        ),
      ).toBe(true);
    } finally {
      vi.useRealTimers();
      logSpy.mockRestore();
      if (prevCooldown === undefined) {
        delete process.env.FAL_PRICING_POST_CATALOG_COOLDOWN_MS;
      } else {
        process.env.FAL_PRICING_POST_CATALOG_COOLDOWN_MS = prevCooldown;
      }
    }
  });

  it("splits batch on HTTP 404 and still fetches pricing for valid ids", async () => {
    const okA = {
      prices: [
        {
          endpoint_id: "fal-ai/a",
          unit_price: 0.01,
          unit: "image",
          currency: "USD",
        },
      ],
    };
    const okB = {
      prices: [
        {
          endpoint_id: "fal-ai/b",
          unit_price: 0.02,
          unit: "image",
          currency: "USD",
        },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => JSON.stringify({ error: "not_found" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => okA,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => okB,
      });
    vi.stubGlobal("fetch", fetchMock);

    const map = await fetchFalUnitPricingMap(["fal-ai/a", "fal-ai/b"], "secret");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(map.get("fal-ai/a")?.unitPrice).toBe(0.01);
    expect(map.get("fal-ai/b")?.unitPrice).toBe(0.02);
  });
});
