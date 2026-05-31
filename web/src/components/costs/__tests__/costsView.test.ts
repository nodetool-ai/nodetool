import {
  apiToView,
  sampleToView,
  rangeToDays,
  inferCategory,
  type DashboardData
} from "../costsView";

const api: DashboardData = {
  window: {
    start: "2026-05-16T00:00:00.000Z",
    end: "2026-05-29T12:00:00.000Z",
    days: 14
  },
  providers: [
    { provider: "openai", total_cost: 1.5, call_count: 10 },
    { provider: "anthropic", total_cost: 0.9, call_count: 5 }
  ],
  daily: [
    { date: "2026-05-16", totals: { openai: 0.2, anthropic: 0.1 } },
    { date: "2026-05-17", totals: { openai: 0.3 } }
  ],
  models: [
    { provider: "openai", model: "gpt-4o", total_cost: 1.2, call_count: 8 }
  ],
  stats: {
    total_cost: 2.4,
    call_count: 15,
    failed_count: 2,
    avg_per_call: 0.16,
    top_model: {
      provider: "openai",
      model: "gpt-4o",
      total_cost: 1.2,
      call_count: 8
    },
    prior_total_cost: 1.2,
    delta_fraction: 1
  },
  executions: [
    {
      id: "p1",
      node_id: "n1",
      workflow_id: "wf1",
      workflow_name: "Alpha",
      provider: "openai",
      model: "gpt-4o",
      cost: 0.01,
      input_tokens: 100,
      output_tokens: 50,
      total_tokens: 150,
      duration: 1.5,
      status: "completed",
      created_at: "2026-05-29T17:47:00.000Z"
    },
    {
      id: "p2",
      node_id: "n2",
      workflow_id: "wf1",
      workflow_name: "Alpha",
      provider: "replicate",
      model: "sdxl-1.0",
      cost: 0.011,
      input_tokens: null,
      output_tokens: null,
      total_tokens: null,
      duration: 7.5,
      status: "failed",
      created_at: "2026-05-29T13:00:00.000Z"
    },
    {
      id: "p3",
      node_id: "n3",
      workflow_id: null,
      workflow_name: null,
      provider: "openai",
      model: "whisper-large-v3",
      cost: 0.006,
      input_tokens: null,
      output_tokens: null,
      total_tokens: null,
      duration: 6.5,
      status: "success",
      created_at: "2026-05-29T10:00:00.000Z"
    }
  ]
};

describe("apiToView", () => {
  const view = apiToView(api);

  it("maps providers in order with a stable colour and stack order", () => {
    expect(view.providers.map((p) => p.id)).toEqual(["openai", "anthropic"]);
    expect(view.providers[0]).toMatchObject({ id: "openai", label: "OpenAI" });
    expect(view.providers[0].color).toMatch(/^#/);
    expect(view.stackOrder).toEqual(["openai", "anthropic"]);
  });

  it("maps daily totals and dates", () => {
    expect(view.days).toHaveLength(2);
    expect(view.days[0].date.getFullYear()).toBe(2026);
    expect(view.days[0].date.getMonth()).toBe(4); // May (0-based)
    expect(view.days[0].date.getDate()).toBe(16);
    expect(view.days[0].values.openai).toBeCloseTo(0.2, 6);
    expect(view.days[0].total).toBeCloseTo(0.3, 6);
  });

  it("maps executions, inferring category and normalizing status", () => {
    expect(view.executions).toHaveLength(3);
    expect(view.executions[0]).toMatchObject({
      title: "gpt-4o",
      category: "llm",
      workflow: "Alpha",
      providerId: "openai",
      status: "ok",
      runtimeSec: 1.5,
      cost: 0.01,
      tokensIn: 100
    });
    expect(view.executions[1]).toMatchObject({
      category: "image",
      status: "error"
    });
    // null workflow falls back to a dash; whisper → audio
    expect(view.executions[2]).toMatchObject({
      workflow: "—",
      category: "audio",
      status: "ok"
    });
  });

  it("derives headline stats and distinct workflow count", () => {
    expect(view.stats).toMatchObject({
      totalSpend: 2.4,
      executionCount: 15,
      failedCount: 2,
      avgPerExecution: 0.16,
      deltaFraction: 1,
      workflowCount: 1 // only wf1 (the null one doesn't count)
    });
    expect(view.stats.topDriver).toEqual({
      label: "gpt-4o",
      providerId: "openai",
      cost: 1.2
    });
  });
});

describe("sampleToView", () => {
  it("returns the curated sample headline for the full window", () => {
    const view = sampleToView("14d");
    expect(view.providers).toHaveLength(6);
    expect(view.days).toHaveLength(14);
    expect(view.executions).toHaveLength(161);
    expect(view.stats.totalSpend).toBeCloseTo(3.356, 6);
    expect(view.stats.executionCount).toBe(161);
    expect(view.stats.failedCount).toBe(9);
    expect(view.stats.workflowCount).toBe(4);
    expect(view.stats.deltaFraction).toBeCloseTo(0.64, 6);
    expect(view.stats.topDriver?.label).toBe("GPT-4o");
  });

  it("slices the window for shorter ranges", () => {
    expect(sampleToView("7d").days).toHaveLength(7);
  });
});

describe("rangeToDays", () => {
  it("maps ranges to day counts", () => {
    expect(rangeToDays("7d")).toBe(7);
    expect(rangeToDays("14d")).toBe(14);
    expect(rangeToDays("30d")).toBe(30);
    expect(rangeToDays("90d")).toBe(90);
  });
});

describe("inferCategory", () => {
  it("classifies common model families", () => {
    expect(inferCategory("openai", "whisper-large-v3")).toBe("audio");
    expect(inferCategory("replicate", "sdxl-1.0")).toBe("image");
    expect(inferCategory("huggingface", "blip2-opt-2.7b")).toBe("text");
    expect(inferCategory("openai", "text-embedding-3-small")).toBe("embedding");
    expect(inferCategory("fal", "birefnet")).toBe("background");
    expect(inferCategory("replicate", "real-esrgan-x4")).toBe("upscale");
    expect(inferCategory("openai", "gpt-4o")).toBe("llm");
  });
});
