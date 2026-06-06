import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchFalBillingCost } from "../src/fal-billing.js";

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
