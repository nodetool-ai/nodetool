import { afterEach, describe, expect, it, vi } from "vitest";
import { getCostReconciler } from "@nodetool-ai/runtime";
import { fetchFalBillingCost, registerFalCostReconciler } from "../src/fal-billing.js";

const REQ = "req-123";

function mockFetchOnce(status: number, body: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body
    }))
  );
}

describe("fetchFalBillingCost", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("registers for generic and legacy FAL provider IDs", () => {
    registerFalCostReconciler();
    expect(getCostReconciler("fal_ai")).toBeDefined();
    expect(getCostReconciler("fal")).toBeDefined();
  });

  it("uses the configured FAL_API_KEY for both provider IDs", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({
        billing_events: [
          { request_id: REQ, cost_estimate_nano_usd: 50_000_000 }
        ]
      })
    }));
    vi.stubGlobal("fetch", fetchMock);
    registerFalCostReconciler();
    for (const provider of ["fal", "fal_ai"]) {
      const reconciler = getCostReconciler(provider);
      expect(reconciler).toBeDefined();
      const result = await reconciler?.({
        requestId: REQ,
        secrets: { FAL_API_KEY: "configured-fal-key" }
      });
      expect(result?.cost).toBe(0.05);
    }
    expect(fetchMock.mock.calls.map(([, init]) => init.headers)).toEqual([
      { Authorization: "Key configured-fal-key" },
      { Authorization: "Key configured-fal-key" }
    ]);
  });

  it("converts cost_estimate_nano_usd to USD for the matching request", async () => {
    mockFetchOnce(200, {
      billing_events: [
        {
          request_id: REQ,
          endpoint_id: "fal-ai/flux/dev",
          output_units: 2,
          unit_price: 0.025,
          cost_estimate_nano_usd: 50_000_000
        }
      ]
    });
    const result = await fetchFalBillingCost("admin-key", REQ);
    expect(result).toEqual({
      cost: 0.05,
      currency: "USD",
      quantity: 2,
      unit_price: 0.025
    });
  });

  it("returns null on 401 without retrying", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({})
    }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchFalBillingCost("bad-key", REQ, { retries: 3 });
    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns null when the event never appears", async () => {
    mockFetchOnce(200, { billing_events: [] });
    const result = await fetchFalBillingCost("admin-key", REQ, {
      retries: 1,
      retryDelayMs: 0
    });
    expect(result).toBeNull();
  });
});
