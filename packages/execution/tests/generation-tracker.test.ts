/**
 * The follower (docs/media-generation-tracking-design.md § 6): a `running`
 * prediction opens the row with the message's id, the terminal message closes
 * it with cost and assets, a failure is a row, a stated charge wins over the
 * catalog, a node's own `provider_cost` is not counted twice, the reconcile
 * queue survives as a query, and the sweep closes what a restart orphaned.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Prediction, initTestDb } from "@nodetool-ai/models";
import type { ProcessingMessage, Prediction as PredictionMessage } from "@nodetool-ai/protocol";
import { registerCostReconciler } from "@nodetool-ai/runtime";
import {
  attachRunCostLedger,
  recordFromMessage
} from "../src/cost-ledger.js";
import {
  createTrackerState,
  drainReconcileQueue,
  generationsForNode,
  linkGenerationAssets,
  reconcileGeneration,
  resetGenerationTrackerState,
  sweepInterruptedGenerations
} from "../src/generation-tracker.js";

const USER = "u1";
const OPTIONS = { userId: USER, workflowId: "wf" };

function prediction(
  overrides: Partial<PredictionMessage> & { id: string; status: string }
): PredictionMessage {
  return {
    type: "prediction",
    user_id: USER,
    node_id: "n1",
    workflow_id: "wf",
    provider: "replicate",
    model: "black-forest-labs/flux-schnell",
    capability: "text_to_image",
    params: { prompt: "a fox" },
    origin: { surface: "workflow", job_id: "job-1", node_id: "n1" },
    ...overrides
  };
}

/** A context stand-in: the one method the ledger listens on. */
function fakeSource(): {
  addMessageListener: (fn: (m: ProcessingMessage) => void) => () => void;
  emit: (m: ProcessingMessage) => Promise<void>;
} {
  const listeners: Array<(m: ProcessingMessage) => void> = [];
  return {
    addMessageListener(fn) {
      listeners.push(fn);
      return () => listeners.splice(listeners.indexOf(fn), 1);
    },
    async emit(m) {
      for (const fn of listeners) fn(m);
      // The listener fires and forgets; let its writes settle.
      await new Promise((r) => setTimeout(r, 20));
    }
  };
}

describe("generation tracker", () => {
  beforeEach(() => {
    initTestDb();
    resetGenerationTrackerState();
  });
  afterEach(() => resetGenerationTrackerState());

  it("opens the row on running and closes it on completed with the same id", async () => {
    const state = createTrackerState();
    await recordFromMessage(prediction({ id: "g1", status: "running" }), OPTIONS, state);
    const open = await Prediction.find("g1");
    expect(open?.status).toBe("running");
    expect(open?.cost).toBeNull();
    expect(open?.surface).toBe("workflow");
    expect(open?.job_id).toBe("job-1");
    expect(open?.parameters).toEqual({ prompt: "a fox" });

    await recordFromMessage(
      prediction({
        id: "g1",
        status: "completed",
        asset_ids: ["asset-1"],
        duration: 4200,
        receipt: { provider_request_id: "req-1" }
      }),
      OPTIONS,
      state
    );
    const closed = await Prediction.find("g1");
    expect(closed?.status).toBe("completed");
    expect(closed?.asset_ids).toEqual(["asset-1"]);
    expect(closed?.provider_request_id).toBe("req-1");
    expect(closed?.duration).toBeCloseTo(4.2);
    expect(closed?.cost).toBeGreaterThan(0);
    expect(closed?.metadata?.price_source).toBe("model-catalog");
    expect(closed?.completed_at).toBeTruthy();
  });

  it("records a failure as a row with the error and no invented cost", async () => {
    const state = createTrackerState();
    await recordFromMessage(prediction({ id: "g2", status: "running" }), OPTIONS, state);
    await recordFromMessage(
      prediction({ id: "g2", status: "failed", error: "provider exploded" }),
      OPTIONS,
      state
    );
    const row = await Prediction.find("g2");
    expect(row?.status).toBe("failed");
    expect(row?.error).toBe("provider exploded");
    expect(row?.cost).toBeNull();
  });

  it("records a cancelled generation", async () => {
    const state = createTrackerState();
    await recordFromMessage(prediction({ id: "g3", status: "running" }), OPTIONS, state);
    await recordFromMessage(prediction({ id: "g3", status: "cancelled" }), OPTIONS, state);
    expect((await Prediction.find("g3"))?.status).toBe("cancelled");
  });

  it("lets a provider-stated charge win over the catalog", async () => {
    const state = createTrackerState();
    await recordFromMessage(prediction({ id: "g4", status: "running" }), OPTIONS, state);
    await recordFromMessage(
      prediction({
        id: "g4",
        status: "completed",
        asset_ids: [],
        receipt: {
          provider_request_id: "req-4",
          cost: { amount: 0.42, currency: "USD", billing_unit: "credits", quantity: 84, unit_price: 0.005 }
        }
      }),
      OPTIONS,
      state
    );
    const row = await Prediction.find("g4");
    expect(row?.cost).toBe(0.42);
    expect(row?.billing_unit).toBe("credits");
    expect(row?.metadata?.price_source).toBe("provider");
  });

  it("does not count a node's own provider_cost when its generation stated the charge", async () => {
    const state = createTrackerState();
    await recordFromMessage(prediction({ id: "g5", status: "running" }), OPTIONS, state);
    await recordFromMessage(
      prediction({
        id: "g5",
        status: "completed",
        asset_ids: [],
        receipt: { cost: { amount: 0.1, currency: "USD" } }
      }),
      OPTIONS,
      state
    );
    await recordFromMessage(
      {
        type: "node_update",
        node_id: "n1",
        node_name: "n1",
        node_type: "fal.Thing",
        status: "completed",
        provider_cost: { provider: "fal", amount: 0.1, unit: "USD" }
      },
      OPTIONS,
      state
    );
    const [rows] = await Prediction.paginate(USER, { limit: 10 });
    expect(rows).toHaveLength(1);
    expect(rows[0].cost).toBe(0.1);
  });

  it("still records a node's provider_cost when no generation stated a charge", async () => {
    const state = createTrackerState();
    await recordFromMessage(
      {
        type: "node_update",
        node_id: "n9",
        node_name: "n9",
        node_type: "fal.Thing",
        status: "completed",
        provider_cost: { provider: "fal", amount: 0.3, unit: "USD" }
      },
      OPTIONS,
      state
    );
    const [rows] = await Prediction.paginate(USER, { limit: 10 });
    expect(rows).toHaveLength(1);
    expect(rows[0].cost).toBe(0.3);
  });

  it("closes a generation whose running message it never saw", async () => {
    await recordFromMessage(
      prediction({ id: "g6", status: "completed", asset_ids: ["a"] }),
      OPTIONS
    );
    const row = await Prediction.find("g6");
    expect(row?.status).toBe("completed");
    expect(row?.asset_ids).toEqual(["a"]);
  });

  it("ignores token-billed capabilities", async () => {
    await recordFromMessage(
      prediction({ id: "g7", status: "running", capability: "generate_message" }),
      OPTIONS
    );
    expect(await Prediction.find("g7")).toBeNull();
  });

  it("attaches through the context seam and records from a live stream", async () => {
    const source = fakeSource();
    const detach = attachRunCostLedger(source, OPTIONS);
    await source.emit(prediction({ id: "g8", status: "running" }));
    await source.emit(prediction({ id: "g8", status: "completed", asset_ids: [] }));
    detach();
    expect((await Prediction.find("g8"))?.status).toBe("completed");
  });

  it("offers unlinked node generations to the autosave and links them", async () => {
    const state = createTrackerState();
    await recordFromMessage(prediction({ id: "g9", status: "running" }), OPTIONS, state);
    await recordFromMessage(
      prediction({ id: "g9", status: "completed", asset_ids: [] }),
      OPTIONS,
      state
    );
    expect(generationsForNode("job-1", "n1")).toEqual(["g9"]);
    await linkGenerationAssets(["g9"], ["asset-9"]);
    expect(generationsForNode("job-1", "n1")).toEqual([]);
    expect((await Prediction.find("g9"))?.asset_ids).toEqual(["asset-9"]);
  });

  it("reconciles by request id, retries with backoff, and leaves the queue after the cap", async () => {
    let calls = 0;
    registerCostReconciler("acme", async ({ requestId }) => {
      calls += 1;
      if (calls < 2) throw new Error("billing not ready");
      return requestId === "req-x" ? { cost: 1.25, currency: "USD" } : null;
    });
    const row = await Prediction.create<Prediction>({
      id: "g10",
      user_id: USER,
      provider: "acme",
      model: "m",
      status: "completed",
      cost: 0.5,
      provider_request_id: "req-x",
      created_at: new Date().toISOString()
    });
    const resolve = async (): Promise<string | null> => "key";

    const first = await reconcileGeneration(row.id, USER, resolve);
    expect(first.reconciled).toBe(false);
    let after = await Prediction.find(row.id);
    expect(after?.reconcile_attempts).toBe(1);
    expect(after?.metadata?.reconcile_error).toBe("billing not ready");
    expect(typeof after?.metadata?.reconcile_next_at).toBe("string");

    // The queue skips it until the backoff elapses.
    expect(await drainReconcileQueue(async () => "key")).toBe(0);

    // Forced: the provider answers now.
    const second = await reconcileGeneration(row.id, USER, resolve);
    expect(second).toMatchObject({ before: 0.5, after: 1.25, reconciled: true });
    after = await Prediction.find(row.id);
    expect(after?.cost).toBe(1.25);
    expect(after?.reconciled_at).toBeTruthy();
    expect(after?.metadata?.price_source).toBe("provider-billing");
    expect(await Prediction.reconcileQueue()).toHaveLength(0);

    // Another user's row is not theirs to reconcile.
    const foreign = await reconcileGeneration(row.id, "u2", resolve);
    expect(foreign.found).toBe(false);
  });

  it("marks a row unavailable when its provider has no reconciler", async () => {
    await Prediction.create<Prediction>({
      id: "g11",
      user_id: USER,
      provider: "nobody",
      model: "m",
      status: "failed",
      cost: null,
      provider_request_id: "req-y",
      created_at: new Date().toISOString()
    });
    expect(await drainReconcileQueue(async () => null)).toBe(1);
    const row = await Prediction.find("g11");
    expect(row?.reconciled_at).toBeTruthy();
    expect(row?.metadata?.reconcile).toBe("unavailable");
    expect(await Prediction.reconcileQueue()).toHaveLength(0);
  });

  it("sweeps running rows older than the process start to interrupted", async () => {
    await Prediction.create<Prediction>({
      id: "old",
      user_id: USER,
      status: "running",
      cost: null,
      started_at: "2026-09-01T00:00:00.000Z",
      created_at: "2026-09-01T00:00:00.000Z"
    });
    await Prediction.create<Prediction>({
      id: "live",
      user_id: USER,
      status: "running",
      cost: null,
      started_at: "2026-09-03T12:00:00.000Z",
      created_at: "2026-09-03T12:00:00.000Z"
    });
    expect(await sweepInterruptedGenerations("2026-09-02T00:00:00.000Z")).toBe(1);
    const old = await Prediction.find("old");
    expect(old?.status).toBe("interrupted");
    expect(old?.metadata?.interrupted_reason).toBe("process restart");
    expect((await Prediction.find("live"))?.status).toBe("running");
  });
});
