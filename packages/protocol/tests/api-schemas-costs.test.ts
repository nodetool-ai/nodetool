import { describe, it, expect } from "vitest";
import {
  listPredictionsInput,
  aggregateInput,
  aggregateByModelInput,
  dashboardInput,
  predictionResponse,
  providerAggregate,
  modelAggregate,
  dashboardDay
} from "../src/api-schemas/costs.js";

describe("listPredictionsInput", () => {
  it("accepts valid input with all fields", () => {
    const result = listPredictionsInput.safeParse({
      provider: "openai",
      model: "gpt-4",
      limit: 100,
      startKey: "abc"
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty object (all fields optional)", () => {
    const result = listPredictionsInput.safeParse({});
    expect(result.success).toBe(true);
  });

  it("defaults limit to 50 when omitted", () => {
    const result = listPredictionsInput.parse({});
    expect(result.limit).toBe(50);
  });

  it("rejects limit below 1", () => {
    const result = listPredictionsInput.safeParse({ limit: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects limit above 500", () => {
    const result = listPredictionsInput.safeParse({ limit: 501 });
    expect(result.success).toBe(false);
  });

  it("accepts limit at lower bound", () => {
    const result = listPredictionsInput.safeParse({ limit: 1 });
    expect(result.success).toBe(true);
  });

  it("accepts limit at upper bound", () => {
    const result = listPredictionsInput.safeParse({ limit: 500 });
    expect(result.success).toBe(true);
  });

  it("rejects non-integer limit", () => {
    const result = listPredictionsInput.safeParse({ limit: 10.5 });
    expect(result.success).toBe(false);
  });
});

describe("aggregateInput", () => {
  it("accepts empty object", () => {
    const result = aggregateInput.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts provider and model filters", () => {
    const result = aggregateInput.safeParse({
      provider: "anthropic",
      model: "claude-3"
    });
    expect(result.success).toBe(true);
  });
});

describe("aggregateByModelInput", () => {
  it("accepts empty object", () => {
    const result = aggregateByModelInput.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts provider filter", () => {
    const result = aggregateByModelInput.safeParse({ provider: "openai" });
    expect(result.success).toBe(true);
  });
});

describe("dashboardInput", () => {
  it("defaults days to 14", () => {
    const result = dashboardInput.parse({});
    expect(result.days).toBe(14);
  });

  it("defaults tzOffsetMinutes to 0", () => {
    const result = dashboardInput.parse({});
    expect(result.tzOffsetMinutes).toBe(0);
  });

  it("defaults executionsLimit to 200", () => {
    const result = dashboardInput.parse({});
    expect(result.executionsLimit).toBe(200);
  });

  it("rejects days below 1", () => {
    const result = dashboardInput.safeParse({ days: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects days above 365", () => {
    const result = dashboardInput.safeParse({ days: 366 });
    expect(result.success).toBe(false);
  });

  it("accepts days at bounds", () => {
    expect(dashboardInput.safeParse({ days: 1 }).success).toBe(true);
    expect(dashboardInput.safeParse({ days: 365 }).success).toBe(true);
  });

  it("rejects tzOffsetMinutes below -840", () => {
    const result = dashboardInput.safeParse({ tzOffsetMinutes: -841 });
    expect(result.success).toBe(false);
  });

  it("rejects tzOffsetMinutes above 840", () => {
    const result = dashboardInput.safeParse({ tzOffsetMinutes: 841 });
    expect(result.success).toBe(false);
  });

  it("accepts tzOffsetMinutes at bounds", () => {
    expect(dashboardInput.safeParse({ tzOffsetMinutes: -840 }).success).toBe(
      true
    );
    expect(dashboardInput.safeParse({ tzOffsetMinutes: 840 }).success).toBe(
      true
    );
  });

  it("rejects executionsLimit below 1", () => {
    const result = dashboardInput.safeParse({ executionsLimit: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects executionsLimit above 1000", () => {
    const result = dashboardInput.safeParse({ executionsLimit: 1001 });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer days", () => {
    const result = dashboardInput.safeParse({ days: 7.5 });
    expect(result.success).toBe(false);
  });
});

describe("predictionResponse", () => {
  const valid = {
    id: "pred-1",
    user_id: "u-1",
    node_id: "n-1",
    node_type: "llm.chat",
    provider: "openai",
    model: "gpt-4",
    workflow_id: null,
    cost: 0.01,
    input_tokens: 100,
    output_tokens: 50,
    total_tokens: 150,
    cached_tokens: null,
    reasoning_tokens: null,
    billing_unit: null,
    quantity: null,
    unit_price: null,
    currency: null,
    created_at: "2024-01-01T00:00:00Z",
    metadata: null
  };

  it("accepts a fully populated prediction", () => {
    expect(predictionResponse.safeParse(valid).success).toBe(true);
  });

  it("accepts all-null optional fields", () => {
    const result = predictionResponse.safeParse({
      ...valid,
      cost: null,
      input_tokens: null,
      output_tokens: null,
      total_tokens: null
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing required fields", () => {
    const { id: _, ...noId } = valid;
    expect(predictionResponse.safeParse(noId).success).toBe(false);
  });

  it("accepts metadata as a record", () => {
    const result = predictionResponse.safeParse({
      ...valid,
      metadata: { key: "value", nested: { a: 1 } }
    });
    expect(result.success).toBe(true);
  });
});

describe("providerAggregate", () => {
  it("accepts valid aggregate", () => {
    const result = providerAggregate.safeParse({
      provider: "openai",
      total_cost: 1.5,
      total_input_tokens: 1000,
      total_output_tokens: 500,
      total_tokens: 1500,
      call_count: 10
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing provider", () => {
    const result = providerAggregate.safeParse({
      total_cost: 1.5,
      total_input_tokens: 1000,
      total_output_tokens: 500,
      total_tokens: 1500,
      call_count: 10
    });
    expect(result.success).toBe(false);
  });
});

describe("modelAggregate", () => {
  it("requires both provider and model", () => {
    const result = modelAggregate.safeParse({
      provider: "anthropic",
      model: "claude-3",
      total_cost: 2.0,
      total_input_tokens: 2000,
      total_output_tokens: 1000,
      total_tokens: 3000,
      call_count: 5
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing model", () => {
    const result = modelAggregate.safeParse({
      provider: "anthropic",
      total_cost: 2.0,
      total_input_tokens: 2000,
      total_output_tokens: 1000,
      total_tokens: 3000,
      call_count: 5
    });
    expect(result.success).toBe(false);
  });
});

describe("dashboardDay", () => {
  it("accepts a valid day entry", () => {
    const result = dashboardDay.safeParse({
      date: "2024-01-15",
      totals: { openai: 1.5, anthropic: 0.8 }
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty totals record", () => {
    const result = dashboardDay.safeParse({
      date: "2024-01-15",
      totals: {}
    });
    expect(result.success).toBe(true);
  });
});
