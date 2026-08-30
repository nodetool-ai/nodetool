/**
 * The budget gate on the run path.
 *
 * A published mini app runs on its creator's secrets, so an over-budget run
 * must be refused *before* the job exists — not reported after a provider has
 * already been paid. These tests drive `runJob` with an `application_id` and
 * assert on both directions: refused runs never start, admitted runs land in
 * the ledger, and a settled run reports what it actually cost.
 *
 * `application_id` comes off the wire, so the gate also has to check that the
 * connection's user owns the app it names — otherwise a client spends a
 * stranger's budget by typing their id.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { unpack } from "msgpackr";
import falUnitPricingCatalog from "@nodetool-ai/fal-nodes/unit-pricing-catalog";
import kieUnitPricingCatalog from "@nodetool-ai/kie-nodes/unit-pricing-catalog";
import { genspendPricingCatalog } from "@nodetool-ai/model-pricing/genspend-catalog";
import {
  DEFAULT_RUN_JOB_EXECUTION_OPTIONS,
  UnifiedWebSocketRunner,
  type WebSocketConnection,
  type WebSocketReceiveFrame
} from "../src/unified-websocket-runner.js";
import { createEmptyDocument } from "@nodetool-ai/app-runtime";
import {
  Application,
  Workflow,
  applicationUsage,
  initTestDb,
  listInvocations,
  publishApplication,
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
const OWNER = "u1";

const appDocument = (workflowId = "wf1") => {
  const document = createEmptyDocument("Demo");
  document.operations = [
    {
      id: "main",
      name: "Run",
      workflowId,
      inputs: {},
      outputs: {},
      policy: "replace"
    }
  ];
  return document;
};

/** The app row the gate authorizes against, plus the workflow it binds. */
const seedApp = async (
  options: { id?: string; userId?: string } = {}
): Promise<Application> => {
  const workflowId = `wf-${options.id ?? APP}`;
  await Workflow.create<Workflow>({
    id: workflowId,
    user_id: options.userId ?? OWNER,
    name: "Demo workflow",
    graph: { nodes: [], edges: [] }
  });
  return Application.create<Application>({
    id: options.id ?? APP,
    user_id: options.userId ?? OWNER,
    name: "Demo app",
    document: JSON.stringify(appDocument(workflowId))
  });
};

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
    await runner.connect(ws, OWNER);
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
    await seedApp();
    await setApplicationBudget(APP, { period: "total", maxUsd: 10 });
    await run({ application_id: APP });

    expect(startJob).toHaveBeenCalledOnce();
    const ledger = await listInvocations(APP);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      invocationId: "job-1",
      version: null,
      status: "running"
    });
  });

  it("starts an app run with no budget row, unmetered but still ledgered", async () => {
    await seedApp();
    await run({ application_id: APP });

    expect(startJob).toHaveBeenCalledOnce();
    expect((await listInvocations(APP)).map((r) => r.invocationId)).toEqual([
      "job-1"
    ]);
  });

  it("refuses a run naming an application this user does not own", async () => {
    await seedApp({ userId: "someone-else" });
    await setApplicationBudget(APP, { period: "total", maxUsd: 10 });

    await run({ application_id: APP });

    expect(startJob).not.toHaveBeenCalled();
    const failure = messages(ws).find(
      (m) => m.type === "job_update" && m.status === "failed"
    );
    expect(failure).toMatchObject({ error_code: "NOT_FOUND" });
    // Nothing was billed to the victim, and their telemetry stayed clean.
    expect(await listInvocations(APP)).toEqual([]);
    expect((await applicationUsage(APP, "total")).invocations).toBe(0);
  });

  it("refuses a run naming an application that does not exist", async () => {
    await run({ application_id: "no-such-app" });

    expect(startJob).not.toHaveBeenCalled();
    expect(await listInvocations("no-such-app")).toEqual([]);
  });

  it("bills a release run to the released version", async () => {
    await publishApplication(await seedApp());

    await run({ application_id: APP, application_version: 1 });

    const [record] = await listInvocations(APP);
    expect(record).toMatchObject({ invocationId: "job-1", version: 1 });
  });

  it("bills a stale client's run to the version it actually ran", async () => {
    // v1 is published, then v2 supersedes it. A client that loaded the app in
    // between still holds v1's snapshot and executes it, so v1 is what the
    // ledger has to say — crediting v2 would corrupt the new release's metrics.
    const app = await seedApp();
    await publishApplication(app);
    await publishApplication(app);

    await run({ application_id: APP, application_version: 1 });

    const [record] = await listInvocations(APP);
    expect(record).toMatchObject({ invocationId: "job-1", version: 1 });
    expect(startJob).toHaveBeenCalledOnce();
    // The client is told it is behind; nothing else in a job's updates would
    // reveal that a newer release exists.
    const notice = messages(ws).find((m) => m.type === "notification");
    expect(notice).toMatchObject({ severity: "warning" });
    expect(String(notice?.content)).toMatch(/version 2 has since been released/);
  });

  it("refuses a run claiming a version the application never had", async () => {
    await publishApplication(await seedApp());

    await run({ application_id: APP, application_version: 99 });

    expect(startJob).not.toHaveBeenCalled();
    const failure = messages(ws).find(
      (m) => m.type === "job_update" && m.status === "failed"
    );
    expect(failure).toMatchObject({ error_code: "INVALID_INPUT" });
    // An unsupportable claim bills nothing — not the release it named, and not
    // the release that happens to be current.
    expect(await listInvocations(APP)).toEqual([]);
  });

  it("records the operation a run belongs to", async () => {
    await seedApp();

    await run({ application_id: APP, operation_id: "main" });

    const [record] = await listInvocations(APP);
    expect(record).toMatchObject({ invocationId: "job-1", operationId: "main" });
  });

  it("records an empty operation for a client that sends none", async () => {
    await seedApp();

    await run({ application_id: APP });

    const [record] = await listInvocations(APP);
    expect(record).toMatchObject({ operationId: "" });
  });

  it("refuses a release run of an app that has released nothing", async () => {
    await seedApp();

    await run({ application_id: APP, application_version: 2 });

    expect(startJob).not.toHaveBeenCalled();
    const failure = messages(ws).find(
      (m) => m.type === "job_update" && m.status === "failed"
    );
    expect(failure).toMatchObject({ error_code: "INVALID_INPUT" });
    expect(await listInvocations(APP)).toEqual([]);
  });

  it("records a draft run against no version even when a release exists", async () => {
    await publishApplication(await seedApp());

    await run({ application_id: APP });

    const [record] = await listInvocations(APP);
    expect(record).toMatchObject({ invocationId: "job-1", version: null });
  });

  it("refuses a run that would cross the budget, before the job exists", async () => {
    await seedApp();
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
    await seedApp();
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
    await seedApp();
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
    // Ledger rows hang off an application row — the foreign key cascades a
    // deleted app's spend away — so both apps these tests book against exist.
    await seedApp();
    await seedApp({ id: "other-app" });
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
    const listeners = new Set<() => void>();
    const now = performance.now();
    return {
      jobId: "job-settle",
      workflowId: "wf1",
      applicationId: APP,
      providerCostTotal: cost,
      requireTerminalResult: false,
      executionOptions: { ...DEFAULT_RUN_JOB_EXECUTION_OPTIONS },
      timings: {
        acceptedAt: now,
        queueMs: 0,
        graphLoadedMs: 0,
        graphHydratedMs: 0,
        preRunMs: 0,
        persistenceMs: 0,
        kernelStartedAt: now
      },
      context: {
        hasMessages: () => queue.length > 0,
        popMessage: () => queue.shift(),
        addMessageListener: (listener: () => void) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
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

  it("leaves another application's reservation alone", async () => {
    await recordInvocation({
      applicationId: "other-app",
      invocationId: "job-settle",
      estimatedUsd: 5
    });

    await stream(activeJob("completed", 0), { status: "completed" });

    const [record] = await listInvocations("other-app");
    expect(record).toMatchObject({ status: "running", actualUsd: null });
    expect((await applicationUsage("other-app", "total")).spentUsd).toBe(5);
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
  // A price billed in "units" or "credits" has no fixed USD value and the
  // estimator refuses to sum it, so the gate can only be checked against an
  // entry billed in something concrete.
  const firstFalPriced = (): { id: string; unitPrice: number } => {
    for (const [id, entry] of Object.entries(falUnitPricingCatalog.prices ?? {})) {
      const { unit_price: price, billing_unit: unit } = entry as {
        unit_price?: unknown;
        billing_unit?: unknown;
      };
      if (typeof price !== "number" || price <= 0) continue;
      if (typeof unit === "string" && /\bunits?\b|\bcredits?\b/i.test(unit)) {
        continue;
      }
      return { id, unitPrice: price };
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

  it("prices a node's fan-out, not one output", () => {
    // A node asked for four images is gated at four. The panel already read
    // `num_images`; the gate priced every fan-out at 1 and admitted a run four
    // times its estimate.
    const { id, unitPrice } = firstFalPriced();
    const model = { id, provider: "fal_ai" };
    expect(
      estimate([
        {
          id: "n1",
          type: "nodetool.image.TextToImage",
          data: { model, num_images: 4 }
        }
      ])
    ).toBeCloseTo(unitPrice * 4);
    expect(
      estimate([
        { id: "n1", type: "nodetool.image.TextToImage", data: { model } }
      ])
    ).toBeCloseTo(unitPrice);
  });

  it("counts a node with no model selection as zero", () => {
    expect(estimate([{ id: "n1", type: "nodetool.text.Concat", data: {} }])).toBe(
      0
    );
  });

  /**
   * A per-video-second entry with a receipted clip envelope: the shortest
   * length it publishes is what an unstated duration prices at, and a length
   * outside the envelope is refused rather than extrapolated.
   */
  const firstPerSecondVideo = (): {
    provider: string;
    id: string;
    unitPrice: number;
    minSeconds: number;
    maxSeconds: number;
  } => {
    for (const [key, entry] of Object.entries(genspendPricingCatalog.prices)) {
      if (entry.unit_class !== "per-video-second") continue;
      if ((entry.data_flags ?? []).some((f) => f.severity === "quote_wrong")) {
        continue;
      }
      // A laddered grid prices off a variant row; this test is about the
      // seconds axis, so take an entry that bills one flat per-second rate.
      if ((entry.variants ?? []).length > 0) continue;
      const clip = entry.clip_seconds;
      if (!clip || typeof clip.min !== "number" || typeof clip.max !== "number") {
        continue;
      }
      if (!(entry.unit_price > 0) || clip.max <= clip.min) continue;
      const separator = key.indexOf(":");
      return {
        provider: key.slice(0, separator),
        id: key.slice(separator + 1),
        unitPrice: entry.unit_price,
        minSeconds: clip.min,
        maxSeconds: clip.max
      };
    }
    throw new Error("GenSpend catalog has no per-video-second entry to price");
  };

  it("reserves more for a per-second model once the node states a duration", () => {
    const { provider, id, unitPrice, minSeconds, maxSeconds } =
      firstPerSecondVideo();
    const node = (data: Record<string, unknown>) => [
      { id: "n1", type: "nodetool.video.TextToVideo", data }
    ];

    const withoutDuration = estimate(node({ model: { id, provider } }));
    const withDuration = estimate(
      node({ model: { id, provider }, duration: maxSeconds })
    );

    // Unstated, the shortest receipted clip is the honest floor.
    expect(withoutDuration).toBeCloseTo(unitPrice * minSeconds);
    expect(withDuration).toBeCloseTo(unitPrice * maxSeconds);
    expect(withDuration).toBeGreaterThan(withoutDuration);
  });

  it("reserves nothing for a duration the model publishes no price for", () => {
    const { provider, id, maxSeconds } = firstPerSecondVideo();

    expect(
      estimate([
        {
          id: "n1",
          type: "nodetool.video.TextToVideo",
          data: { model: { id, provider }, duration: maxSeconds + 1 }
        }
      ])
    ).toBe(0);
  });
});
