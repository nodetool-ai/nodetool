/**
 * The generation lifecycle on the predictions table
 * (docs/media-generation-tracking-design.md § 6, § 7, § 10): user-scoped
 * reads, the one-UPDATE cancel, the reconcile queue as a query, the startup
 * sweep, and aggregates that ignore an open row.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ModelObserver } from "../src/base-model.js";
import { initTestDb } from "../src/db.js";
import { Prediction } from "../src/prediction.js";

async function row(data: Record<string, unknown> = {}): Promise<Prediction> {
  return Prediction.create<Prediction>({
    user_id: "u1",
    provider: "fal",
    model: "flux",
    capability: "text_to_image",
    status: "completed",
    cost: 1,
    created_at: new Date().toISOString(),
    ...data
  });
}

describe("Prediction generations", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("findForUser hides another user's row", async () => {
    const mine = await row();
    const theirs = await row({ user_id: "u2" });
    expect((await Prediction.findForUser("u1", mine.id))?.id).toBe(mine.id);
    expect(await Prediction.findForUser("u1", theirs.id)).toBeNull();
  });

  it("listGenerations filters, orders newest first and pages by cursor", async () => {
    const t = (offset: number): string =>
      new Date(Date.UTC(2026, 8, 3, 12, 0, offset)).toISOString();
    await row({ created_at: t(1), status: "completed", thread_id: "th" });
    await row({ created_at: t(2), status: "running", thread_id: "th" });
    await row({ created_at: t(3), status: "failed", job_id: "job" });
    await row({ created_at: t(4), user_id: "u2" });

    const [all, next] = await Prediction.listGenerations("u1", { limit: 2 });
    expect(all.map((p) => p.status)).toEqual(["failed", "running"]);
    expect(next).toBe(all[1].id);
    const [rest, done] = await Prediction.listGenerations("u1", {
      limit: 2,
      startKey: next
    });
    expect(rest.map((p) => p.status)).toEqual(["completed"]);
    expect(done).toBe("");

    const [running] = await Prediction.listGenerations("u1", {
      status: "running"
    });
    expect(running).toHaveLength(1);
    const [byThread] = await Prediction.listGenerations("u1", {
      threadId: "th"
    });
    expect(byThread).toHaveLength(2);
    const [byJob] = await Prediction.listGenerations("u1", { jobId: "job" });
    expect(byJob.map((p) => p.status)).toEqual(["failed"]);
    const [since] = await Prediction.listGenerations("u1", { since: t(3) });
    expect(since).toHaveLength(1);
  });

  it("markCancelledIfRunning flips a running row exactly once, for its owner", async () => {
    const running = await row({ status: "running", cost: null });
    const done = await row({ status: "completed" });
    expect(await Prediction.markCancelledIfRunning(running.id, "u2")).toBe(
      false
    );
    expect(await Prediction.markCancelledIfRunning(done.id, "u1")).toBe(false);
    expect(await Prediction.markCancelledIfRunning(running.id, "u1")).toBe(
      true
    );
    expect(await Prediction.markCancelledIfRunning(running.id, "u1")).toBe(
      false
    );
    const after = await Prediction.find(running.id);
    expect(after?.status).toBe("cancelled");
    expect(after?.completed_at).toBeTruthy();
  });

  it("reconcileQueue holds only settled, unreconciled rows with a request id", async () => {
    const queued = await row({ provider_request_id: "r1" });
    await row({ provider_request_id: null });
    await row({ provider_request_id: "r2", reconciled_at: "2026-01-01" });
    await row({ provider_request_id: "r3", status: "running", cost: null });
    await row({ provider_request_id: "r4", reconcile_attempts: 5 });
    const failed = await row({
      provider_request_id: "r5",
      status: "failed",
      cost: null
    });
    const ids = (await Prediction.reconcileQueue()).map((p) => p.id).sort();
    expect(ids).toEqual([queued.id, failed.id].sort());
  });

  it("sweepInterrupted closes only running rows that started before the cutoff", async () => {
    const old = await row({
      status: "running",
      cost: null,
      started_at: "2026-09-01T00:00:00.000Z"
    });
    const fresh = await row({
      status: "running",
      cost: null,
      started_at: "2026-09-03T12:00:00.000Z"
    });
    const done = await row({ started_at: "2026-09-01T00:00:00.000Z" });
    const swept = await Prediction.sweepInterrupted("2026-09-02T00:00:00.000Z");
    expect(swept.map((p) => p.id)).toEqual([old.id]);
    expect((await Prediction.find(old.id))?.status).toBe("interrupted");
    expect((await Prediction.find(fresh.id))?.status).toBe("running");
    expect((await Prediction.find(done.id))?.status).toBe("completed");
  });

  it("aggregates leave an open row out of the totals and count it apart", async () => {
    await row({ cost: 2 });
    await row({ status: "running", cost: null });
    await row({ status: "failed", cost: 0.5 });
    await row({ status: "interrupted", cost: null });

    const user = await Prediction.aggregateByUser("u1");
    expect(user.total_cost).toBe(2.5);
    expect(user.call_count).toBe(3);
    expect(user.unpriced_count).toBe(1);
    expect(user.running_count).toBe(1);
    expect(user.interrupted_count).toBe(1);

    const [byProvider] = await Prediction.aggregateByProvider("u1");
    expect(byProvider.call_count).toBe(3);
    expect(byProvider.unpriced_count).toBe(1);

    const [byModel] = await Prediction.aggregateByModel("u1");
    expect(byModel.call_count).toBe(3);

    const dashboard = await Prediction.aggregateDashboard("u1", { days: 2 });
    expect(dashboard.stats.call_count).toBe(3);
    expect(dashboard.stats.total_cost).toBe(2.5);
    expect(dashboard.stats.running_count).toBe(1);
    expect(dashboard.stats.interrupted_count).toBe(1);
    expect(dashboard.executions.map((e) => e.status).sort()).toEqual([
      "completed",
      "failed",
      "interrupted",
      "running"
    ]);
  });

  it("stores and reads the new lifecycle columns", async () => {
    const p = await row({
      surface: "capability",
      thread_id: "t1",
      tool_call_id: "c1",
      job_id: "j1",
      asset_ids: ["a1", "a2"],
      reconcile_attempts: 2
    });
    const back = await Prediction.find(p.id);
    expect(back?.capability).toBe("text_to_image");
    expect(back?.surface).toBe("capability");
    expect(back?.asset_ids).toEqual(["a1", "a2"]);
    expect(back?.reconcile_attempts).toBe(2);
    expect(back?.reconciled_at).toBeNull();
  });
});
