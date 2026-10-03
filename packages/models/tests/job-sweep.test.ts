/**
 * The startup sweep that fails runs a previous process left in flight. Without
 * it a restart strands every in-flight row at `running`, and the editor
 * reattaches to each one whenever the workflow opens.
 */
import { describe, it, expect, beforeEach } from "vitest";

import { initTestDb } from "../src/db.js";
import { Job } from "../src/job.js";

const BEFORE = "2026-01-01T00:00:00.000Z";
const PROCESS_START = "2026-01-02T00:00:00.000Z";
const AFTER = "2026-01-03T00:00:00.000Z";

const create = (
  id: string,
  status: string,
  createdAt: string,
  runnerInstance: string | null = null
) =>
  Job.create({
    id,
    workflow_id: "wf",
    user_id: "1",
    status,
    params: {},
    graph: { nodes: [], edges: [] },
    runner_instance: runnerInstance,
    created_at: createdAt
  });

const statusOf = async (id: string) => (await Job.get<Job>(id))?.status;

describe("Job.sweepInterrupted", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("fails every in-flight row created before the process started", async () => {
    for (const status of ["scheduled", "queued", "running"]) {
      await create(status, status, BEFORE);
    }

    const swept = await Job.sweepInterrupted(PROCESS_START, null);

    expect(swept.map((job) => job.id).sort()).toEqual([
      "queued",
      "running",
      "scheduled"
    ]);
    for (const id of ["scheduled", "queued", "running"]) {
      const row = await Job.get<Job>(id);
      expect(row?.status).toBe("failed");
      expect(row?.error).toMatch(/server restarted/);
      expect(row?.finished_at).toBeTruthy();
    }
  });

  it("leaves settled rows and rows from this process alone", async () => {
    await create("completed", "completed", BEFORE);
    await create("cancelled", "cancelled", BEFORE);
    await create("fresh", "running", AFTER);

    expect(await Job.sweepInterrupted(PROCESS_START, null)).toEqual([]);

    expect(await statusOf("completed")).toBe("completed");
    expect(await statusOf("cancelled")).toBe("cancelled");
    expect(await statusOf("fresh")).toBe("running");
  });

  it("with an instance id, sweeps only the rows that instance stamped", async () => {
    await create("mine", "running", BEFORE, "machine-a");
    await create("peer", "running", BEFORE, "machine-b");
    await create("unstamped", "running", BEFORE, null);

    const swept = await Job.sweepInterrupted(PROCESS_START, "machine-a");

    expect(swept.map((job) => job.id)).toEqual(["mine"]);
    expect(await statusOf("mine")).toBe("failed");
    expect(await statusOf("peer")).toBe("running");
    expect(await statusOf("unstamped")).toBe("running");
  });
});
