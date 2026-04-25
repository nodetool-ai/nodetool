import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type {
  AggregateByUserOutput,
  ProviderAggregate,
  ModelAggregate,
  PredictionResponse
} from "@nodetool/protocol/api-schemas/costs.js";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

vi.mock("@nodetool/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool/models")>();
  return {
    ...actual,
    Prediction: {
      paginate: vi.fn(),
      aggregateByUser: vi.fn(),
      aggregateByProvider: vi.fn(),
      aggregateByModel: vi.fn()
    }
  };
});

import { Prediction } from "@nodetool/models";

const createCaller = createCallerFactory(appRouter);

function makeCtx(overrides: Partial<Context> = {}): Context {
  return {
    userId: "user-1",
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false,
    ...overrides
  };
}

describe("costs router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("list returns predictions + next_start_key", async () => {
    // Note: Prediction.paginate returns [items, cursorString] — cursor is "" when
    // there's no next page, never null. The REST handler coerces empty → null for
    // the client, and so should the tRPC procedure.
    const row: PredictionResponse = {
      id: "p1",
      user_id: "user-1",
      node_id: "n1",
      provider: "openai",
      model: "gpt-4",
      workflow_id: null,
      cost: 0.01,
      input_tokens: 100,
      output_tokens: 50,
      total_tokens: 150,
      cached_tokens: null,
      reasoning_tokens: null,
      created_at: "2026-04-17T00:00:00Z",
      metadata: null
    };
    (Prediction.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([
      [row],
      "next-key"
    ]);
    const caller = createCaller(makeCtx());
    const result = await caller.costs.list({ limit: 10 });
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0]?.id).toBe("p1");
    expect(result.next_start_key).toBe("next-key");
    expect(Prediction.paginate).toHaveBeenCalledWith("user-1", {
      provider: undefined,
      model: undefined,
      limit: 10,
      startKey: undefined
    });
  });

  it("list coerces empty cursor to null", async () => {
    (Prediction.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([[], ""]);
    const caller = createCaller(makeCtx());
    const result = await caller.costs.list({ limit: 10 });
    expect(result.next_start_key).toBeNull();
  });

  it("list with filters forwards provider + model", async () => {
    (Prediction.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([
      [],
      ""
    ]);
    const caller = createCaller(makeCtx());
    await caller.costs.list({
      provider: "anthropic",
      model: "claude",
      limit: 50
    });
    expect(Prediction.paginate).toHaveBeenCalledWith("user-1", {
      provider: "anthropic",
      model: "claude",
      limit: 50,
      startKey: undefined
    });
  });

  it("aggregate returns aggregateByUser result", async () => {
    const agg: AggregateByUserOutput = {
      user_id: "user-1",
      provider: null,
      model: null,
      total_cost: 1.23,
      total_input_tokens: 500,
      total_output_tokens: 500,
      total_tokens: 1000,
      call_count: 5
    };
    (Prediction.aggregateByUser as ReturnType<typeof vi.fn>).mockResolvedValue(
      agg
    );
    const caller = createCaller(makeCtx());
    await expect(caller.costs.aggregate({})).resolves.toEqual(agg);
    expect(Prediction.aggregateByUser).toHaveBeenCalledWith("user-1", {
      provider: undefined,
      model: undefined
    });
  });

  it("aggregate forwards provider + model filters", async () => {
    const agg: AggregateByUserOutput = {
      user_id: "user-1",
      provider: "openai",
      model: "gpt-4",
      total_cost: 0.5,
      total_input_tokens: 100,
      total_output_tokens: 100,
      total_tokens: 200,
      call_count: 1
    };
    (Prediction.aggregateByUser as ReturnType<typeof vi.fn>).mockResolvedValue(
      agg
    );
    const caller = createCaller(makeCtx());
    await caller.costs.aggregate({ provider: "openai", model: "gpt-4" });
    expect(Prediction.aggregateByUser).toHaveBeenCalledWith("user-1", {
      provider: "openai",
      model: "gpt-4"
    });
  });

  it("aggregateByProvider returns the grouped array", async () => {
    const grouped: ProviderAggregate[] = [
      {
        provider: "openai",
        total_cost: 1,
        total_input_tokens: 100,
        total_output_tokens: 100,
        total_tokens: 200,
        call_count: 1
      },
      {
        provider: "anthropic",
        total_cost: 2,
        total_input_tokens: 300,
        total_output_tokens: 300,
        total_tokens: 600,
        call_count: 3
      }
    ];
    (
      Prediction.aggregateByProvider as ReturnType<typeof vi.fn>
    ).mockResolvedValue(grouped);
    const caller = createCaller(makeCtx());
    await expect(caller.costs.aggregateByProvider()).resolves.toEqual(grouped);
    expect(Prediction.aggregateByProvider).toHaveBeenCalledWith("user-1");
  });

  it("aggregateByModel returns the grouped array and forwards provider filter", async () => {
    const grouped: ModelAggregate[] = [
      {
        provider: "openai",
        model: "gpt-4",
        total_cost: 1,
        total_input_tokens: 100,
        total_output_tokens: 100,
        total_tokens: 200,
        call_count: 1
      }
    ];
    (
      Prediction.aggregateByModel as ReturnType<typeof vi.fn>
    ).mockResolvedValue(grouped);
    const caller = createCaller(makeCtx());
    await expect(
      caller.costs.aggregateByModel({ provider: "openai" })
    ).resolves.toEqual(grouped);
    expect(Prediction.aggregateByModel).toHaveBeenCalledWith("user-1", {
      provider: "openai"
    });
  });

  it("aggregateByModel without filter passes no provider", async () => {
    (
      Prediction.aggregateByModel as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);
    const caller = createCaller(makeCtx());
    await caller.costs.aggregateByModel({});
    expect(Prediction.aggregateByModel).toHaveBeenCalledWith("user-1", {
      provider: undefined
    });
  });

  it("summary aggregates everything in parallel", async () => {
    const overall: AggregateByUserOutput = {
      user_id: "user-1",
      provider: null,
      model: null,
      total_cost: 2,
      total_input_tokens: 100,
      total_output_tokens: 100,
      total_tokens: 200,
      call_count: 2
    };
    (Prediction.aggregateByUser as ReturnType<typeof vi.fn>).mockResolvedValue(
      overall
    );
    (
      Prediction.aggregateByProvider as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);
    (
      Prediction.aggregateByModel as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);
    (Prediction.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([
      [],
      ""
    ]);
    const caller = createCaller(makeCtx());
    const result = await caller.costs.summary();
    expect(result.overall).toEqual(overall);
    expect(result.by_provider).toEqual([]);
    expect(result.by_model).toEqual([]);
    expect(result.recent_calls).toEqual([]);
    // summary should call aggregateByUser/Provider/Model with no filters (userId only)
    // and paginate with limit=10
    expect(Prediction.aggregateByUser).toHaveBeenCalledWith("user-1");
    expect(Prediction.aggregateByProvider).toHaveBeenCalledWith("user-1");
    expect(Prediction.aggregateByModel).toHaveBeenCalledWith("user-1");
    expect(Prediction.paginate).toHaveBeenCalledWith("user-1", { limit: 10 });
  });

  it("rejects unauthenticated callers", async () => {
    const caller = createCaller(makeCtx({ userId: null }));
    await expect(caller.costs.list({ limit: 10 })).rejects.toMatchObject({
      code: "UNAUTHORIZED"
    });
  });
});
