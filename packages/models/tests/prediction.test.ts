import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ModelObserver } from "../src/base-model.js";
import { initTestDb } from "../src/db.js";
import { Prediction } from "../src/prediction.js";
import { Workflow } from "../src/workflow.js";

function setup() {
  initTestDb();
}

async function createPrediction(
  data: Record<string, unknown> = {}
): Promise<Prediction> {
  return Prediction.create<Prediction>({
    user_id: (data.user_id as string) ?? "u1",
    node_id: (data.node_id as string) ?? "node-1",
    node_type: (data.node_type as string) ?? "",
    provider: (data.provider as string) ?? "openai",
    model: (data.model as string) ?? "gpt-4o",
    workflow_id: (data.workflow_id as string | null | undefined) ?? null,
    status: (data.status as string) ?? "completed",
    cost: (data.cost as number | null | undefined) ?? 1,
    input_tokens: (data.input_tokens as number | null | undefined) ?? 10,
    output_tokens: (data.output_tokens as number | null | undefined) ?? 5,
    total_tokens: (data.total_tokens as number | null | undefined) ?? 15,
    cached_tokens: (data.cached_tokens as number | null | undefined) ?? 0,
    reasoning_tokens: (data.reasoning_tokens as number | null | undefined) ?? 0,
    created_at: (data.created_at as string) ?? new Date().toISOString(),
    metadata:
      (data.metadata as Record<string, unknown> | null | undefined) ?? null
  });
}

describe("Prediction model", () => {
  beforeEach(setup);
  afterEach(() => ModelObserver.clear());

  it("creates with defaults", async () => {
    const prediction = await Prediction.create<Prediction>({ user_id: "u1" });
    expect(prediction.id).toBeTruthy();
    expect(prediction.node_id).toBe("");
    expect(prediction.node_type).toBe("");
    expect(prediction.provider).toBe("");
    expect(prediction.model).toBe("");
    expect(prediction.status).toBe("pending");
    expect(prediction.created_at).toBeTruthy();
  });

  it("persists unit-based billing fields", async () => {
    const prediction = await Prediction.create<Prediction>({
      user_id: "u1",
      provider: "fal",
      model: "fal-ai/veo3",
      cost: 3.2,
      currency: "USD",
      billing_unit: "seconds",
      quantity: 8,
      unit_price: 0.4,
      status: "completed"
    });
    const found = await Prediction.find(prediction.id);
    expect(found).not.toBeNull();
    expect(found!.provider).toBe("fal");
    expect(found!.cost).toBe(3.2);
    expect(found!.currency).toBe("USD");
    expect(found!.billing_unit).toBe("seconds");
    expect(found!.quantity).toBe(8);
    expect(found!.unit_price).toBe(0.4);
  });

  it("defaults billing fields to null", async () => {
    const prediction = await Prediction.create<Prediction>({ user_id: "u1" });
    expect(prediction.billing_unit).toBeNull();
    expect(prediction.quantity).toBeNull();
    expect(prediction.unit_price).toBeNull();
    expect(prediction.currency).toBeNull();
  });

  it("find returns a prediction by id", async () => {
    const prediction = await createPrediction({ user_id: "u1" });
    const found = await Prediction.find(prediction.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(prediction.id);
  });

  it("paginate filters by user, provider, and model and returns a cursor", async () => {
    await createPrediction({
      user_id: "u1",
      provider: "openai",
      model: "gpt-4o",
      created_at: "2025-01-03T00:00:00.000Z"
    });
    await createPrediction({
      user_id: "u1",
      provider: "openai",
      model: "gpt-4o-mini",
      created_at: "2025-01-02T00:00:00.000Z"
    });
    await createPrediction({
      user_id: "u1",
      provider: "anthropic",
      model: "claude",
      created_at: "2025-01-01T00:00:00.000Z"
    });
    await createPrediction({
      user_id: "u2",
      provider: "openai",
      model: "gpt-4o"
    });

    const [openAiOnly] = await Prediction.paginate("u1", {
      provider: "openai"
    });
    expect(openAiOnly).toHaveLength(2);

    const [exactModel] = await Prediction.paginate("u1", {
      provider: "openai",
      model: "gpt-4o"
    });
    expect(exactModel).toHaveLength(1);

    const [limited, cursor] = await Prediction.paginate("u1", { limit: 2 });
    expect(limited).toHaveLength(2);
    expect(cursor).toBeTruthy();
  });

  it("paginate returns an empty page and empty cursor when limit is zero", async () => {
    await createPrediction({ user_id: "u1" });

    const [items, cursor] = await Prediction.paginate("u1", { limit: 0 });
    expect(items).toEqual([]);
    expect(cursor).toBe("");
  });

  it("aggregateByUser returns totals with optional filters", async () => {
    await createPrediction({
      user_id: "u1",
      provider: "openai",
      model: "gpt-4o",
      cost: 2.5,
      input_tokens: 20,
      output_tokens: 10,
      total_tokens: 30
    });
    await createPrediction({
      user_id: "u1",
      provider: "anthropic",
      model: "claude",
      cost: 1.5,
      input_tokens: 5,
      output_tokens: 15,
      total_tokens: 20
    });

    const overall = await Prediction.aggregateByUser("u1");
    expect(overall.total_cost).toBe(4);
    expect(overall.total_input_tokens).toBe(25);
    expect(overall.total_output_tokens).toBe(25);
    expect(overall.total_tokens).toBe(50);
    expect(overall.call_count).toBe(2);

    const filtered = await Prediction.aggregateByUser("u1", {
      provider: "openai",
      model: "gpt-4o"
    });
    expect(filtered.total_cost).toBe(2.5);
    expect(filtered.call_count).toBe(1);
  });

  it("treats null numeric aggregates as zero", async () => {
    await Prediction.create<Prediction>({
      user_id: "u1",
      node_id: "node-1",
      provider: "openai",
      model: "gpt-4o",
      status: "completed",
      cost: null,
      input_tokens: null,
      output_tokens: null,
      total_tokens: null
    });

    const byUser = await Prediction.aggregateByUser("u1");
    expect(byUser.total_cost).toBe(0);
    expect(byUser.total_input_tokens).toBe(0);
    expect(byUser.total_output_tokens).toBe(0);
    expect(byUser.total_tokens).toBe(0);

    const [byProvider] = await Prediction.aggregateByProvider("u1");
    expect(byProvider).toMatchObject({
      provider: "openai",
      total_cost: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_tokens: 0,
      call_count: 1
    });

    const [byModel] = await Prediction.aggregateByModel("u1");
    expect(byModel).toMatchObject({
      provider: "openai",
      model: "gpt-4o",
      total_cost: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_tokens: 0,
      call_count: 1
    });
  });

  it("aggregateByProvider groups predictions by provider", async () => {
    await createPrediction({
      user_id: "u1",
      provider: "openai",
      model: "gpt-4o",
      cost: 2,
      total_tokens: 20
    });
    await createPrediction({
      user_id: "u1",
      provider: "openai",
      model: "gpt-4o-mini",
      cost: 1,
      total_tokens: 10
    });
    await createPrediction({
      user_id: "u1",
      provider: "anthropic",
      model: "claude",
      cost: 4,
      total_tokens: 40
    });

    const groups = await Prediction.aggregateByProvider("u1");
    expect(groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "openai",
          total_cost: 3,
          total_tokens: 30,
          call_count: 2
        }),
        expect.objectContaining({
          provider: "anthropic",
          total_cost: 4,
          total_tokens: 40,
          call_count: 1
        })
      ])
    );
  });

  it("aggregateByModel groups predictions by provider and model", async () => {
    await createPrediction({
      user_id: "u1",
      provider: "openai",
      model: "gpt-4o",
      cost: 2,
      total_tokens: 20
    });
    await createPrediction({
      user_id: "u1",
      provider: "openai",
      model: "gpt-4o",
      cost: 1,
      total_tokens: 10
    });
    await createPrediction({
      user_id: "u1",
      provider: "openai",
      model: "gpt-4o-mini",
      cost: 4,
      total_tokens: 40
    });
    await createPrediction({
      user_id: "u1",
      provider: "anthropic",
      model: "claude",
      cost: 3,
      total_tokens: 30
    });

    const openAiGroups = await Prediction.aggregateByModel("u1", {
      provider: "openai"
    });
    expect(openAiGroups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "openai",
          model: "gpt-4o",
          total_cost: 3,
          total_tokens: 30,
          call_count: 2
        }),
        expect.objectContaining({
          provider: "openai",
          model: "gpt-4o-mini",
          total_cost: 4,
          total_tokens: 40,
          call_count: 1
        })
      ])
    );

    const allGroups = await Prediction.aggregateByModel("u1");
    expect(allGroups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "anthropic",
          model: "claude",
          total_cost: 3,
          total_tokens: 30,
          call_count: 1
        })
      ])
    );
  });
});

describe("Prediction.aggregateDashboard", () => {
  beforeEach(setup);
  afterEach(() => ModelObserver.clear());

  const DAY = 86_400_000;
  const isoDaysAgo = (d: number): string =>
    new Date(Date.now() - d * DAY).toISOString();

  it("aggregates a trailing window into providers, daily series, models and stats", async () => {
    // today (two openai calls)
    await createPrediction({
      user_id: "u1",
      provider: "openai",
      model: "gpt-4o",
      cost: 2,
      created_at: isoDaysAgo(0)
    });
    await createPrediction({
      user_id: "u1",
      provider: "openai",
      model: "gpt-4o",
      cost: 1,
      created_at: isoDaysAgo(0)
    });
    // 2 days ago
    await createPrediction({
      user_id: "u1",
      provider: "anthropic",
      model: "claude",
      cost: 4,
      created_at: isoDaysAgo(2)
    });
    // 1 day ago, failed
    await createPrediction({
      user_id: "u1",
      provider: "fal",
      model: "flux",
      cost: 0.5,
      status: "failed",
      created_at: isoDaysAgo(1)
    });
    // outside the window
    await createPrediction({
      user_id: "u1",
      provider: "openai",
      model: "gpt-4o",
      cost: 99,
      created_at: isoDaysAgo(40)
    });
    // different user
    await createPrediction({
      user_id: "u2",
      provider: "openai",
      model: "gpt-4o",
      cost: 50,
      created_at: isoDaysAgo(0)
    });

    const result = await Prediction.aggregateDashboard("u1", {
      days: 7,
      tzOffsetMinutes: 0
    });

    expect(result.window.days).toBe(7);
    expect(result.daily).toHaveLength(7);

    // excludes out-of-window + other users: 2 + 1 + 4 + 0.5 = 7.5
    expect(result.stats.total_cost).toBeCloseTo(7.5, 6);
    expect(result.stats.call_count).toBe(4);
    expect(result.stats.failed_count).toBe(1);
    expect(result.stats.avg_per_call).toBeCloseTo(7.5 / 4, 6);

    // providers sorted by cost desc: anthropic(4), openai(3), fal(0.5)
    expect(result.providers.map((p) => p.provider)).toEqual([
      "anthropic",
      "openai",
      "fal"
    ]);
    const openai = result.providers.find((p) => p.provider === "openai");
    expect(openai?.total_cost).toBeCloseTo(3, 6);
    expect(openai?.call_count).toBe(2);

    expect(result.stats.top_model).toMatchObject({
      provider: "anthropic",
      model: "claude"
    });
    expect(result.stats.top_model?.total_cost).toBeCloseTo(4, 6);

    // today's bucket (last day) holds the two openai calls = 3
    const today = result.daily[result.daily.length - 1];
    expect(today.totals.openai ?? 0).toBeCloseTo(3, 6);

    // daily provider totals sum to the overall total
    const dailySum = result.daily.reduce(
      (acc, d) => acc + Object.values(d.totals).reduce((a, b) => a + b, 0),
      0
    );
    expect(dailySum).toBeCloseTo(7.5, 6);
  });

  it("computes the prior-window delta", async () => {
    await createPrediction({
      user_id: "u1",
      provider: "openai",
      cost: 10,
      created_at: isoDaysAgo(1)
    });
    await createPrediction({
      user_id: "u1",
      provider: "openai",
      cost: 5,
      created_at: isoDaysAgo(9) // prior 7-day window
    });

    const result = await Prediction.aggregateDashboard("u1", {
      days: 7,
      tzOffsetMinutes: 0
    });
    expect(result.stats.prior_total_cost).toBeCloseTo(5, 6);
    expect(result.stats.delta_fraction).toBeCloseTo(1, 6); // (10 - 5) / 5
  });

  it("returns a null delta when the prior window is empty", async () => {
    await createPrediction({
      user_id: "u1",
      provider: "openai",
      cost: 3,
      created_at: isoDaysAgo(0)
    });
    const result = await Prediction.aggregateDashboard("u1", { days: 7 });
    expect(result.stats.delta_fraction).toBeNull();
    expect(result.stats.prior_total_cost).toBe(0);
  });

  it("resolves workflow names and duration for recent executions", async () => {
    await Workflow.create<Workflow>({
      id: "wf-1",
      user_id: "u1",
      name: "Product shots batch"
    });
    await Prediction.create<Prediction>({
      user_id: "u1",
      provider: "openai",
      model: "gpt-4o",
      node_type: "nodetool.llm.GenerateText",
      cost: 1,
      workflow_id: "wf-1",
      duration: 2.5,
      status: "completed",
      created_at: isoDaysAgo(0)
    });

    const result = await Prediction.aggregateDashboard("u1", {
      days: 7,
      tzOffsetMinutes: 0
    });
    expect(result.executions).toHaveLength(1);
    expect(result.executions[0]).toMatchObject({
      workflow_id: "wf-1",
      workflow_name: "Product shots batch",
      provider: "openai",
      model: "gpt-4o",
      node_type: "nodetool.llm.GenerateText",
      duration: 2.5
    });
  });

  it("returns empty structures when there is no spend", async () => {
    const result = await Prediction.aggregateDashboard("u1", { days: 7 });
    expect(result.providers).toEqual([]);
    expect(result.models).toEqual([]);
    expect(result.executions).toEqual([]);
    expect(result.daily).toHaveLength(7);
    expect(result.stats.total_cost).toBe(0);
    expect(result.stats.top_model).toBeNull();
  });
});
