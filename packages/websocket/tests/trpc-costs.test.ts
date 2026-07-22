import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { DashboardOutput } from "@nodetool-ai/protocol/api-schemas/costs.js";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

vi.mock("@nodetool-ai/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/models")>();
  return {
    ...actual,
    Prediction: {
      aggregateDashboard: vi.fn()
    }
  };
});

import { Prediction } from "@nodetool-ai/models";

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

  it("dashboard forwards the window params and returns the aggregate", async () => {
    const payload: DashboardOutput = {
      window: {
        start: "2026-05-16T00:00:00.000Z",
        end: "2026-05-29T12:00:00.000Z",
        days: 14
      },
      providers: [{ provider: "openai", total_cost: 1.35, call_count: 12 }],
      daily: [{ date: "2026-05-16", totals: { openai: 0.1 } }],
      models: [
        { provider: "openai", model: "gpt-4o", total_cost: 1.21, call_count: 8 }
      ],
      stats: {
        total_cost: 3.36,
        call_count: 161,
        failed_count: 9,
        avg_per_call: 0.0209,
        top_model: {
          provider: "openai",
          model: "gpt-4o",
          total_cost: 1.21,
          call_count: 8
        },
        prior_total_cost: 2.05,
        delta_fraction: 0.64
      },
      executions: [
        {
          id: "p1",
          node_id: "n1",
          node_type: "nodetool.llm.GenerateText",
          workflow_id: "wf1",
          workflow_name: "Product shots batch",
          provider: "openai",
          model: "gpt-4o",
          cost: 0.01,
          input_tokens: 100,
          output_tokens: 50,
          total_tokens: 150,
          duration: 1.5,
          status: "completed",
          created_at: "2026-05-29T17:47:00.000Z"
        }
      ]
    };
    (
      Prediction.aggregateDashboard as ReturnType<typeof vi.fn>
    ).mockResolvedValue(payload);
    const caller = createCaller(makeCtx());
    const result = await caller.costs.dashboard({
      days: 14,
      tzOffsetMinutes: -120,
      executionsLimit: 200
    });
    expect(result.stats.total_cost).toBe(3.36);
    expect(result.providers[0]?.provider).toBe("openai");
    expect(result.daily[0]?.totals.openai).toBeCloseTo(0.1, 6);
    expect(Prediction.aggregateDashboard).toHaveBeenCalledWith("user-1", {
      days: 14,
      tzOffsetMinutes: -120,
      executionsLimit: 200
    });
  });

  it("dashboard applies input defaults", async () => {
    (
      Prediction.aggregateDashboard as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      window: { start: "", end: "", days: 14 },
      providers: [],
      daily: [],
      models: [],
      stats: {
        total_cost: 0,
        call_count: 0,
        failed_count: 0,
        avg_per_call: 0,
        top_model: null,
        prior_total_cost: 0,
        delta_fraction: null
      },
      executions: []
    } satisfies DashboardOutput);
    const caller = createCaller(makeCtx());
    await caller.costs.dashboard({});
    expect(Prediction.aggregateDashboard).toHaveBeenCalledWith("user-1", {
      days: 14,
      tzOffsetMinutes: 0,
      executionsLimit: 200
    });
  });

  it("rejects unauthenticated callers", async () => {
    const caller = createCaller(makeCtx({ userId: null }));
    await expect(caller.costs.dashboard({})).rejects.toMatchObject({
      code: "UNAUTHORIZED"
    });
  });
});
