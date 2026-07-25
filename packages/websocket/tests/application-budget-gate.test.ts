/**
 * The budget gate on the run path.
 *
 * A published mini app runs on its creator's secrets, so an over-budget run
 * must be refused *before* the job exists — not reported after a provider has
 * already been paid. These tests drive `runJob` with an `application_id` and
 * assert on both directions: refused runs never start, admitted runs land in
 * the ledger, and a settled run reports what it actually cost.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { unpack } from "msgpackr";
import falUnitPricingCatalog from "@nodetool-ai/fal-nodes/unit-pricing-catalog";
import kieUnitPricingCatalog from "@nodetool-ai/kie-nodes/unit-pricing-catalog";
import {
  UnifiedWebSocketRunner,
  type WebSocketConnection,
  type WebSocketReceiveFrame
} from "../src/unified-websocket-runner.js";
import {
  applicationUsage,
  initTestDb,
  listInvocations,
  recordInvocation,
  setApplicationBudget
} from "@nodetool-ai/models";

vi.mock("../src/lib/thumbnail.js", () => ({
  storeAssetWithThumbnail: vi.fn(async () => undefined)
}));

class MockWebSocket implements WebSocketConnection {
  clientState: "connected" | "disconnected" = "connected";
  applicationState: "connected" | "disconnected" = "connected";
  sentBytes: Uint8Array[] = [];
  sentText: string[] = [];
  closed = false;

  async accept(): Promise<void> {}
  async receive(): Promise<WebSocketReceiveFrame> {
    return { type: "websocket.disconnect" };
  }
  async sendBytes(data: Uint8Array): Promise<void> {
    this.sentBytes.push(data);
  }
  async sendText(data: string): Promise<void> {
    this.sentText.push(data);
  }
  async close(): Promise<void> {
    this.closed = true;
  }
}

const asAny = (value: unknown) => value as never as Record<string, never>;

const messages = (ws: MockWebSocket): Array<Record<string, unknown>> =>
  ws.sentBytes.map((b) => unpack(b) as Record<string, unknown>);

const APP = "app-budget-gate";

describe("application budget gate", () => {
  let ws: MockWebSocket;
  let runner: UnifiedWebSocketRunner;
  let startJob: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    await initTestDb();
    vi.clearAllMocks();
    ws = new MockWebSocket();
    runner = new UnifiedWebSocketRunner({
      resolveExecutor: () => undefined as never
    });
    await runner.connect(ws);
    // The gate's job is to decide whether a run starts; the run itself is
    // covered elsewhere, so stub it and assert on whether it was reached.
    startJob = vi.fn(async () => undefined);
    (asAny(runner) as unknown as { startJob: unknown }).startJob = startJob;
  });

  afterEach(async () => {
    await runner.disconnect();
  });

  const run = (over: Record<string, unknown> = {}) =>
    (
      runner as unknown as {
        runJob(req: Record<string, unknown>): Promise<void>;
      }
    ).runJob({
      job_id: "job-1",
      workflow_id: "wf1",
      graph: { nodes: [], edges: [] },
      ...over
    });

  it("starts a run with no application attached, unmetered", async () => {
    await run();
    expect(startJob).toHaveBeenCalledOnce();
    expect(await listInvocations(APP)).toEqual([]);
  });

  it("starts an app run and records it in the ledger", async () => {
    await setApplicationBudget(APP, { period: "total", maxUsd: 10 });
    await run({ application_id: APP, application_version: 2 });

    expect(startJob).toHaveBeenCalledOnce();
    const ledger = await listInvocations(APP);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      invocationId: "job-1",
      version: 2,
      status: "running"
    });
  });

  it("refuses a run that would cross the budget, before the job exists", async () => {
    await setApplicationBudget(APP, { period: "total", maxUsd: 1 });
    // Spend the budget with an earlier run.
    await run({ application_id: APP, job_id: "job-early" });
    const [firstRecord] = await listInvocations(APP);
    expect(firstRecord).toBeDefined();

    await setApplicationBudget(APP, { period: "total", maxInvocations: 1 });
    startJob.mockClear();
    await run({ application_id: APP, job_id: "job-2" });

    expect(startJob).not.toHaveBeenCalled();
    const failure = messages(ws).find(
      (m) => m.type === "job_update" && m.status === "failed"
    );
    expect(failure).toBeDefined();
    expect(String(failure?.error)).toMatch(/1 of its 1/);
    // The refused run left no ledger row, so it cannot consume budget either.
    expect((await listInvocations(APP)).map((r) => r.invocationId)).toEqual([
      "job-early"
    ]);
  });

  it("keeps runs flowing when the ledger itself errors", async () => {
    // A budget backend that is down must not take runs down with it; only an
    // explicit refusal blocks.
    await setApplicationBudget(APP, { period: "total", maxUsd: 10 });
    const broken = vi
      .spyOn(runner as unknown as { estimateRunCost: () => number }, "estimateRunCost")
      .mockImplementation(() => {
        throw new Error("pricing bundle unavailable");
      });
    await run({ application_id: APP });
    expect(startJob).toHaveBeenCalledOnce();
    broken.mockRestore();
  });

  it("counts an unsettled run at its estimate", async () => {
    await run({ application_id: APP });
    const usage = await applicationUsage(APP, "total");
    expect(usage.invocations).toBe(1);
    expect(usage.spentUsd).toBe(0);
  });
});

describe("application invocation settlement", () => {
  let ws: MockWebSocket;
  let runner: UnifiedWebSocketRunner;

  beforeEach(async () => {
    await initTestDb();
    vi.clearAllMocks();
    ws = new MockWebSocket();
    runner = new UnifiedWebSocketRunner({
      resolveExecutor: () => ({ async process() { return {}; } }) as never
    });
    await runner.connect(ws);
  });

  afterEach(async () => {
    await runner.disconnect();
  });

  /** A finished run carrying an app id and a recorded provider charge. */
  const activeJob = (status: "completed" | "failed", cost: number) => {
    const queue: Array<Record<string, unknown>> = [];
    return {
      jobId: "job-settle",
      workflowId: "wf1",
      applicationId: APP,
      providerCostTotal: cost,
      context: {
        hasMessages: () => queue.length > 0,
        popMessage: () => queue.shift(),
        normalizeOutputValue: vi.fn(async (v: unknown) => v),
        getNodeStatuses: () => ({}),
        getEdgeStatuses: () => ({})
      },
      runner: { cancel: vi.fn() },
      graph: { nodes: [], edges: [] },
      finished: false,
      status
    };
  };

  const stream = (active: unknown, result: unknown) =>
    (
      runner as unknown as {
        streamJobMessages(a: unknown, p: Promise<unknown>): Promise<void>;
      }
    ).streamJobMessages(active, Promise.resolve(result));

  it("closes the ledger row out at what the run actually cost", async () => {
    await recordInvocation({
      applicationId: APP,
      invocationId: "job-settle",
      estimatedUsd: 5
    });
    expect((await applicationUsage(APP, "total")).spentUsd).toBe(5);

    await stream(activeJob("completed", 0.42), { status: "completed" });

    const [record] = await listInvocations(APP);
    expect(record).toMatchObject({ status: "completed", actualUsd: 0.42 });
    // The estimate no longer counts once the real figure lands.
    expect((await applicationUsage(APP, "total")).spentUsd).toBeCloseTo(0.42);
  });

  it("settles a failed run too, so its spend is not stranded at the estimate", async () => {
    await recordInvocation({
      applicationId: APP,
      invocationId: "job-settle",
      estimatedUsd: 5
    });
    await stream(activeJob("failed", 0.1), {
      status: "failed",
      error: "boom"
    });

    const [record] = await listInvocations(APP);
    expect(record).toMatchObject({ status: "failed", actualUsd: 0.1 });
  });
});

/**
 * What the gate can actually price. Node-type metadata only carries a price for
 * provider-specific nodes; a generic node (nodetool.image.TextToImage and
 * friends) picks its model at runtime, so the estimate has to price the
 * selection. Without that, every generic node was free and no USD budget could
 * refuse a run.
 */
describe("pre-run cost estimate", () => {
  const firstFalPriced = (): { id: string; unitPrice: number } => {
    for (const [id, entry] of Object.entries(falUnitPricingCatalog.prices ?? {})) {
      const price = (entry as { unit_price?: unknown }).unit_price;
      if (typeof price === "number" && price > 0) return { id, unitPrice: price };
    }
    throw new Error("FAL pricing catalog has no priced entry");
  };

  const firstKiePriced = (): { id: string; unitPrice: number } => {
    for (const [id, entry] of Object.entries(kieUnitPricingCatalog.prices ?? {})) {
      const price = (entry as { usd_price?: unknown }).usd_price;
      if (typeof price === "number" && price > 0) return { id, unitPrice: price };
    }
    throw new Error("kie pricing catalog has no USD-priced entry");
  };

  /** A generic node type exposing a single provider-model property. */
  const genericMetadata = {
    properties: [{ name: "model", type: { type: "image_model" } }]
  };

  const estimate = (
    nodes: Array<Record<string, unknown>>,
    metadata: unknown = genericMetadata
  ): number => {
    const runner = new UnifiedWebSocketRunner({
      resolveExecutor: () => undefined as never,
      getNodeMetadata: () => metadata as never
    });
    return (
      runner as unknown as {
        estimateRunCost(req: Record<string, unknown>): number;
      }
    ).estimateRunCost({ graph: { nodes, edges: [] } });
  };

  it("prices a FAL model selected on a generic node", () => {
    const { id, unitPrice } = firstFalPriced();
    const total = estimate([
      {
        id: "n1",
        type: "nodetool.image.TextToImage",
        data: { model: { id, provider: "fal_ai" } }
      }
    ]);
    expect(total).toBeCloseTo(unitPrice);
  });

  it("prices a kie model selected on a generic node", () => {
    const { id, unitPrice } = firstKiePriced();
    const total = estimate([
      {
        id: "n1",
        type: "nodetool.image.TextToImage",
        data: { model: { id, provider: "kie" } }
      }
    ]);
    expect(total).toBeCloseTo(unitPrice);
  });

  it("counts an unpriced model as zero instead of throwing", () => {
    expect(
      estimate([
        {
          id: "n1",
          type: "nodetool.image.TextToImage",
          data: { model: { id: "no-such/model", provider: "anthropic" } }
        }
      ])
    ).toBe(0);
  });

  it("counts a node with no model selection as zero", () => {
    expect(estimate([{ id: "n1", type: "nodetool.text.Concat", data: {} }])).toBe(
      0
    );
  });
});
