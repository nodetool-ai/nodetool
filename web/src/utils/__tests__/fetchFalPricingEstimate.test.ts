/**
 * @jest-environment jsdom
 */
import { fetchFalPricingEstimate } from "../fetchFalPricingEstimate";

describe("fetchFalPricingEstimate", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns null on 204 (no API key)", async () => {
    global.fetch = jest.fn().mockResolvedValue({ status: 204, ok: false });

    const result = await fetchFalPricingEstimate("fal-ai/flux/dev");
    expect(result).toBeNull();
  });

  it("POSTs historical estimate with call_quantity 1", async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        endpoint_id: "fal-ai/flux/dev",
        estimate_type: "historical_api_price",
        total_cost: 0.03,
        currency: "USD",
      }),
    });
    global.fetch = mockFetch;

    const result = await fetchFalPricingEstimate("fal-ai/flux/dev");

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/fal/pricing/estimate"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          endpoint_id: "fal-ai/flux/dev",
          estimate_type: "historical_api_price",
          call_quantity: 1,
        }),
      }),
    );
    expect(result).toEqual({
      endpoint_id: "fal-ai/flux/dev",
      estimate_type: "historical_api_price",
      total_cost: 0.03,
      currency: "USD",
    });
  });

  it("returns null on HTTP error", async () => {
    global.fetch = jest.fn().mockResolvedValue({ status: 502, ok: false });

    const result = await fetchFalPricingEstimate("fal-ai/flux/dev");
    expect(result).toBeNull();
  });
});
