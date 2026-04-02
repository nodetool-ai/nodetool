/**
 * Tests for cost-api.ts — cost tracking endpoints.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prediction } from "@nodetool/models";
import { handleCostRequest } from "../src/cost-api.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function makePrediction(overrides: Partial<Prediction> = {}): Prediction {
  return new Prediction({
    id: "pred-1",
    user_id: "user-1",
    node_id: "node-1",
    provider: "openai",
    model: "gpt-4",
    workflow_id: "wf-1",
    cost: 0.05,
    input_tokens: 100,
    output_tokens: 50,
    total_tokens: 150,
    cached_tokens: 0,
    reasoning_tokens: 0,
    created_at: new Date().toISOString(),
    ...overrides
  });
}

function makeRequest(
  urlPath: string,
  method = "GET",
  userId = "user-1"
): Request {
  return new Request(`http://localhost${urlPath}`, {
    method,
    headers: { "x-user-id": userId }
  });
}

describe("handleCostRequest", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null for non-cost routes", async () => {
    const res = await handleCostRequest(makeRequest("/api/other"), {});
    expect(res).toBeNull();
  });

  it("returns 405 for non-GET methods", async () => {
    const res = await handleCostRequest(makeRequest("/api/costs", "POST"), {});
    expect(res).not.toBeNull();
    expect(res!.status).toBe(405);
  });

  it("GET /api/costs returns paginated predictions", async () => {
    const pred = makePrediction();
    vi.spyOn(Prediction, "paginate").mockResolvedValue([[pred], null]);

    const res = await handleCostRequest(makeRequest("/api/costs"), {});
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const body = await res!.json();
    expect(body.calls).toHaveLength(1);
    expect(body.calls[0].id).toBe("pred-1");
    expect(body.calls[0].provider).toBe("openai");
    expect(body.next_start_key).toBeNull();
  });

  it("GET /api/costs respects limit clamping", async () => {
    vi.spyOn(Prediction, "paginate").mockResolvedValue([[], null]);

    await handleCostRequest(makeRequest("/api/costs?limit=9999"), {});

    // Limit should be clamped to 500
    expect(Prediction.paginate).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ limit: 500 })
    );
  });

  it("GET /api/costs defaults limit for invalid values", async () => {
    vi.spyOn(Prediction, "paginate").mockResolvedValue([[], null]);

    await handleCostRequest(makeRequest("/api/costs?limit=0"), {});

    // 0 is falsy for parseInt, falls back to default 50, then clamps to max(50,1)=50
    expect(Prediction.paginate).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ limit: 50 })
    );
  });

  it("GET /api/costs/aggregate returns aggregated data", async () => {
    const agg = { total_cost: 1.5, total_tokens: 1000 };
    vi.spyOn(Prediction, "aggregateByUser").mockResolvedValue(agg as never);

    const res = await handleCostRequest(
      makeRequest("/api/costs/aggregate"),
      {}
    );
    expect(res!.status).toBe(200);
    const body = await res!.json();
    expect(body.total_cost).toBe(1.5);
  });

  it("GET /api/costs/aggregate/by-provider returns provider breakdown", async () => {
    const data = [{ provider: "openai", total_cost: 1.0 }];
    vi.spyOn(Prediction, "aggregateByProvider").mockResolvedValue(
      data as never
    );

    const res = await handleCostRequest(
      makeRequest("/api/costs/aggregate/by-provider"),
      {}
    );
    expect(res!.status).toBe(200);
    const body = await res!.json();
    expect(body).toEqual(data);
  });

  it("GET /api/costs/aggregate/by-model returns model breakdown", async () => {
    const data = [{ model: "gpt-4", total_cost: 0.5 }];
    vi.spyOn(Prediction, "aggregateByModel").mockResolvedValue(data as never);

    const res = await handleCostRequest(
      makeRequest("/api/costs/aggregate/by-model"),
      {}
    );
    expect(res!.status).toBe(200);
    const body = await res!.json();
    expect(body).toEqual(data);
  });

  it("GET /api/costs/summary returns combined summary", async () => {
    vi.spyOn(Prediction, "aggregateByUser").mockResolvedValue({
      total_cost: 2.0
    } as never);
    vi.spyOn(Prediction, "aggregateByProvider").mockResolvedValue([] as never);
    vi.spyOn(Prediction, "aggregateByModel").mockResolvedValue([] as never);
    vi.spyOn(Prediction, "paginate").mockResolvedValue([[], null]);

    const res = await handleCostRequest(makeRequest("/api/costs/summary"), {});
    expect(res!.status).toBe(200);
    const body = await res!.json();
    expect(body.overall).toBeDefined();
    expect(body.by_provider).toBeDefined();
    expect(body.by_model).toBeDefined();
    expect(body.recent_calls).toBeDefined();
  });

  it("passes provider and model filter parameters", async () => {
    vi.spyOn(Prediction, "paginate").mockResolvedValue([[], null]);

    await handleCostRequest(
      makeRequest("/api/costs?provider=anthropic&model=claude-3"),
      {}
    );

    expect(Prediction.paginate).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        provider: "anthropic",
        model: "claude-3"
      })
    );
  });

  it("strips trailing slashes from pathname", async () => {
    vi.spyOn(Prediction, "paginate").mockResolvedValue([[], null]);

    const res = await handleCostRequest(makeRequest("/api/costs/"), {});
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
  });
});
