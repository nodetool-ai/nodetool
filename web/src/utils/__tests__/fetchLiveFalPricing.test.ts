import { fetchLiveFalPricing } from "../fetchLiveFalPricing";

const mockFetch = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  // @ts-expect-error
  global.fetch = mockFetch;
});

describe("fetchLiveFalPricing", () => {
  it("returns false for empty endpointIds", async () => {
    const result = await fetchLiveFalPricing({}, []);
    expect(result).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("fetches with correct URL and updates metadata", async () => {
    const metadataByType: Record<string, any> = {
      "fal.FastSDXL": {
        fal_unit_pricing: { endpoint_id: "fal-ai/fast-sdxl" }
      }
    };

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          byEndpointId: {
            "fal-ai/fast-sdxl": {
              unit_price: 0.02,
              billing_unit: "image",
              currency: "usd"
            }
          },
          fetched_at: "2026-01-20T00:00:00Z"
        })
    });

    const result = await fetchLiveFalPricing(metadataByType, [
      "fal-ai/fast-sdxl"
    ]);

    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      `${window.location.origin}/api/fal/pricing?endpoint_id=fal-ai%2Ffast-sdxl`
    );
    expect(metadataByType["fal.FastSDXL"].fal_unit_pricing).toEqual({
      endpoint_id: "fal-ai/fast-sdxl",
      unit_price: 0.02,
      billing_unit: "image",
      currency: "usd",
      source: "live",
      checked_at: "2026-01-20T00:00:00Z"
    });
  });

  it("returns false when no matching entries", async () => {
    const metadataByType: Record<string, any> = {
      "fal.FastSDXL": {
        fal_unit_pricing: { endpoint_id: "fal-ai/fast-sdxl" }
      }
    };

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          byEndpointId: {
            "fal-ai/other-model": {
              unit_price: 0.05,
              billing_unit: "second",
              currency: "usd"
            }
          },
          fetched_at: "2026-01-20T00:00:00Z"
        })
    });

    const result = await fetchLiveFalPricing(metadataByType, [
      "fal-ai/fast-sdxl"
    ]);
    expect(result).toBe(false);
  });

  it("returns false on fetch error", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));

    const result = await fetchLiveFalPricing({}, ["fal-ai/fast-sdxl"]);
    expect(result).toBe(false);
  });

  it("returns false on non-ok response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500
    });

    const result = await fetchLiveFalPricing({}, ["fal-ai/fast-sdxl"]);
    expect(result).toBe(false);
  });

  it("returns false on 204 response", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204
    });

    const result = await fetchLiveFalPricing({}, ["fal-ai/fast-sdxl"]);
    expect(result).toBe(false);
  });
});
