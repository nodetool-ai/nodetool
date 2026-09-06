/**
 * In-flight progress on a job row (A5.6).
 *
 * The write must not resurrect a settled run — the same hazard
 * `markCancelledIfActive` exists for — so the terminal case is exercised
 * alongside the active one.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { initTestDb } from "../src/db.js";
import { Job } from "../src/job.js";

describe("Job.recordProgressIfActive", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("writes progress on a running job and reads it back", async () => {
    const job = await Job.create<Job>({
      user_id: "u1",
      workflow_id: "w1",
      status: "running",
      metadata_json: { outputs: { a: 1 } }
    });
    expect(
      await Job.recordProgressIfActive(job.id, { progress: 12, total: 240 })
    ).toBe(true);
    const reloaded = await Job.find("u1", job.id);
    expect(reloaded?.progressRecord()).toEqual({ progress: 12, total: 240 });
    // The merge keeps what was already on the row.
    expect(reloaded?.metadata_json?.["outputs"]).toEqual({ a: 1 });
  });

  it("changes nothing once the job has settled", async () => {
    const job = await Job.create<Job>({
      user_id: "u1",
      workflow_id: "w1",
      status: "completed"
    });
    expect(
      await Job.recordProgressIfActive(job.id, { progress: 5, total: 10 })
    ).toBe(false);
    expect((await Job.find("u1", job.id))?.progressRecord()).toBeNull();
  });
});
