import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ModelObserver } from "../src/base-model.js";
import { initTestDb } from "../src/db.js";
import { Prediction } from "../src/prediction.js";

function setup() {
  initTestDb();
}

async function createPrediction(
  data: Record<string, unknown> = {}
): Promise<Prediction> {
  return Prediction.create<Prediction>({
    user_id: (data.user_id as string) ?? "u1",
    node_id: (data.node_id as string) ?? "node-1",
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
    expect(prediction.provider).toBe("");
    expect(prediction.model).toBe("");
    expect(prediction.status).toBe("pending");
    expect(prediction.created_at).toBeTruthy();
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
