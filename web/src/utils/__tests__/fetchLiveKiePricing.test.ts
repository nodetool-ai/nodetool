import { fetchLiveKiePricing } from "../fetchLiveKiePricing";

const mockFetch = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = mockFetch as unknown as typeof fetch;
});

describe("fetchLiveKiePricing", () => {
  it("returns null for empty modelIds", async () => {
    const result = await fetchLiveKiePricing({}, []);
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("fetches with correct URL and returns updated pricing without mutating input", async () => {
    const originalPricing = { model_id: "kie-ai/fast-gen" };
    const metadataByType: Record<string, any> = {
      "kie.FastGen": {
        kie_unit_pricing: originalPricing
      }
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          byModelId: {
            "kie-ai/fast-gen": {
              model_id: "kie-ai/fast-gen",
              unit_price: 8,
              billing_unit: "image",
              currency: "credits",
              usd_price: 0.08,
              tier_count: 3,
              pricing_url: "https://kie.ai/pricing"
            }
          },
          fetched_at: "2026-02-20T00:00:00Z"
        })
    });

    const result = await fetchLiveKiePricing(metadataByType, [
      "kie-ai/fast-gen"
    ]);

    expect(mockFetch).toHaveBeenCalledWith(
      `${window.location.origin}/api/kie/pricing?model_id=kie-ai%2Ffast-gen`
    );
    expect(result).toEqual({
      "kie.FastGen": {
        model_id: "kie-ai/fast-gen",
        unit_price: 8,
        billing_unit: "image",
        currency: "credits",
        usd_price: 0.08,
        tier_count: 3,
        pricing_url: "https://kie.ai/pricing",
        source: "live",
        checked_at: "2026-02-20T00:00:00Z"
      }
    });
    // The input metadata is left untouched — callers merge the returned
    // pricing into NEW metadata objects so per-node selectors re-render.
    expect(metadataByType["kie.FastGen"].kie_unit_pricing).toBe(
      originalPricing
    );
    expect(metadataByType["kie.FastGen"].kie_unit_pricing).toEqual({
      model_id: "kie-ai/fast-gen"
    });
  });

  it("returns null when no matching entries in response", async () => {
    const metadataByType: Record<string, any> = {
      "kie.FastGen": {
        kie_unit_pricing: { model_id: "kie-ai/fast-gen" }
      }
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          byModelId: {
            "kie-ai/other-model": {
              model_id: "kie-ai/other-model",
              unit_price: 10,
              billing_unit: "second",
              currency: "credits"
            }
          },
          fetched_at: "2026-02-20T00:00:00Z"
        })
    });

    const result = await fetchLiveKiePricing(metadataByType, [
      "kie-ai/fast-gen"
    ]);
    expect(result).toBeNull();
  });

  it("returns null on fetch error", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockFetch.mockRejectedValue(new Error("Network error"));

    const result = await fetchLiveKiePricing({}, ["kie-ai/fast-gen"]);
    expect(result).toBeNull();
    spy.mockRestore();
  });

  it("returns null on non-ok response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500
    });

    const result = await fetchLiveKiePricing({}, ["kie-ai/fast-gen"]);
    expect(result).toBeNull();
  });

  it("returns null when response has no byModelId", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ fetched_at: "2026-02-20T00:00:00Z" })
    });

    const result = await fetchLiveKiePricing({}, ["kie-ai/fast-gen"]);
    expect(result).toBeNull();
  });

  it("skips metadata entries without existing kie_unit_pricing", async () => {
    const metadataByType: Record<string, any> = {
      "kie.NoPricing": { node_type: "kie.NoPricing" }
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          byModelId: {
            "kie-ai/fast-gen": {
              model_id: "kie-ai/fast-gen",
              unit_price: 5,
              billing_unit: "image",
              currency: "credits"
            }
          },
          fetched_at: "2026-02-20T00:00:00Z"
        })
    });

    const result = await fetchLiveKiePricing(metadataByType, [
      "kie-ai/fast-gen"
    ]);
    expect(result).toBeNull();
    expect(metadataByType["kie.NoPricing"].kie_unit_pricing).toBeUndefined();
  });

  it("appends multiple model_id params to URL", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ byModelId: {}, fetched_at: "2026-02-20T00:00:00Z" })
    });

    await fetchLiveKiePricing({}, ["model-a", "model-b"]);

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("model_id=model-a");
    expect(calledUrl).toContain("model_id=model-b");
  });
});
