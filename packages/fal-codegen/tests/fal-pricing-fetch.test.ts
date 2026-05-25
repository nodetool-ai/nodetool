import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchFalPricing } from "../src/fal-pricing-fetch.js";

interface MockResponse {
  ok: boolean;
  status: number;
  headers?: Record<string, string>;
  jsonBody?: unknown;
  textBody?: string;
}

function makeFetchMock(handler: (ids: string[]) => MockResponse) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const ids = [...new URL(url).searchParams.getAll("endpoint_id")];
    const r = handler(ids);
    return {
      ok: r.ok,
      status: r.status,
      headers: { get: (k: string) => r.headers?.[k.toLowerCase()] ?? null },
      json: async () => r.jsonBody,
      text: async () => r.textBody ?? ""
    } as unknown as Response;
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchFalPricing", () => {
  it("returns prices keyed by endpoint_id on a successful batch", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetchMock((ids) => ({
        ok: true,
        status: 200,
        jsonBody: {
          prices: ids.map((id) => ({
            endpoint_id: id,
            unit_price: 0.01,
            unit: "request",
            currency: "USD"
          }))
        }
      }))
    );

    const out = await fetchFalPricing(["fal-ai/a", "fal-ai/b"], "key");
    expect(out).toEqual({
      "fal-ai/a": { unit_price: 0.01, billing_unit: "request", currency: "USD" },
      "fal-ai/b": { unit_price: 0.01, billing_unit: "request", currency: "USD" }
    });
  });

  it("bisects on 404 so one unknown endpoint does not poison the batch", async () => {
    const unknown = new Set(["fal-ai/dead"]);
    vi.stubGlobal(
      "fetch",
      makeFetchMock((ids) => {
        if (ids.some((id) => unknown.has(id))) {
          return { ok: false, status: 404, textBody: "not found" };
        }
        return {
          ok: true,
          status: 200,
          jsonBody: {
            prices: ids.map((id) => ({
              endpoint_id: id,
              unit_price: 0.5,
              unit: "second",
              currency: "USD"
            }))
          }
        };
      })
    );

    const out = await fetchFalPricing(
      ["fal-ai/a", "fal-ai/b", "fal-ai/dead", "fal-ai/d"],
      "key"
    );

    expect(Object.keys(out).sort()).toEqual(["fal-ai/a", "fal-ai/b", "fal-ai/d"]);
    expect(out["fal-ai/a"].unit_price).toBe(0.5);
    expect(out).not.toHaveProperty("fal-ai/dead");
  });

  it("retries on 429 honoring Retry-After", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      makeFetchMock((ids) => {
        calls++;
        if (calls === 1) {
          return {
            ok: false,
            status: 429,
            headers: { "retry-after": "0" },
            textBody: "slow down"
          };
        }
        return {
          ok: true,
          status: 200,
          jsonBody: {
            prices: ids.map((id) => ({
              endpoint_id: id,
              unit_price: 1,
              unit: "request",
              currency: "USD"
            }))
          }
        };
      })
    );

    const out = await fetchFalPricing(["fal-ai/a"], "key");
    expect(out["fal-ai/a"].unit_price).toBe(1);
    expect(calls).toBe(2);
  });

  it("omits endpoints from a batch that fails with a non-404, non-429 status", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetchMock(() => ({ ok: false, status: 500, textBody: "boom" }))
    );

    const out = await fetchFalPricing(["fal-ai/a", "fal-ai/b"], "key");
    expect(out).toEqual({});
  });
});
