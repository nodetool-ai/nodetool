/**
 * The two conditional job queries the cross-instance cancel path depends on.
 *
 * Both exist to avoid a read-modify-write: a cancel arriving on an instance
 * that does not own the run races the owner's own terminal write, and a full
 * row `save()` built from a pre-race snapshot would overwrite whatever the
 * owner had just recorded.
 */
import { describe, it, expect, beforeEach } from "vitest";

import { initTestDb } from "../src/db.js";
import { Job } from "../src/job.js";

const create = (id: string, status: string, userId = "1") =>
  Job.create({
    id,
    workflow_id: "wf",
    user_id: userId,
    status,
    params: {},
    graph: { nodes: [], edges: [] }
  });

describe("Job.markCancelledIfActive", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("cancels an active row and says so", async () => {
    await create("active", "running");

    expect(await Job.markCancelledIfActive("active", "1")).toBe(true);

    const row = await Job.get<Job>("active");
    expect(row?.status).toBe("cancelled");
    expect(row?.finished_at).toBeTruthy();
  });

  it("leaves a terminal row untouched and says nothing changed", async () => {
    for (const status of ["completed", "failed", "cancelled"]) {
      await create(status, status);
      expect(await Job.markCancelledIfActive(status, "1")).toBe(false);
      expect((await Job.get<Job>(status))?.status).toBe(status);
    }
  });

  it("preserves what the owner wrote when it loses the race", async () => {
    await create("raced", "running");

    // The owner finishes first, cost and all.
    const owner = await Job.get<Job>("raced");
    owner!.markCompleted();
    owner!.cost = 0.42;
    await owner!.save();

    expect(await Job.markCancelledIfActive("raced", "1")).toBe(false);

    const row = await Job.get<Job>("raced");
    expect(row?.status).toBe("completed");
    expect(row?.cost).toBe(0.42);
  });

  it("will not cancel another user's run", async () => {
    await create("theirs", "running", "2");

    expect(await Job.markCancelledIfActive("theirs", "1")).toBe(false);
    expect((await Job.get<Job>("theirs"))?.status).toBe("running");
  });
});

describe("Job.cancelledAmong", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("returns only the cancelled ids", async () => {
    await create("a", "running");
    await create("b", "cancelled");
    await create("c", "completed");

    expect(await Job.cancelledAmong(["a", "b", "c", "missing"])).toEqual(["b"]);
  });

  it("queries nothing for an empty list", async () => {
    expect(await Job.cancelledAmong([])).toEqual([]);
  });
});
