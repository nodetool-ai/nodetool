/**
 * Which rows the startup job sweep may touch depends on whether a peer could
 * share the database. A shared database without an instance id cannot tell
 * this server's rows from a live peer's, so it is skipped.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initTestDb, Job } from "@nodetool-ai/models";

import { sweepInterruptedJobs } from "../src/interrupted-jobs.js";

const BEFORE = "2026-01-01T00:00:00.000Z";
const PROCESS_START = "2026-01-02T00:00:00.000Z";

const createRunning = (id: string, runnerInstance: string | null) =>
  Job.create({
    id,
    workflow_id: "wf",
    user_id: "1",
    status: "running",
    params: {},
    graph: { nodes: [], edges: [] },
    runner_instance: runnerInstance,
    created_at: BEFORE
  });

const statusOf = async (id: string) => (await Job.get<Job>(id))?.status;

describe("sweepInterruptedJobs", () => {
  beforeEach(() => {
    initTestDb();
    delete process.env["NODETOOL_INSTANCE_ID"];
    delete process.env["FLY_MACHINE_ID"];
  });

  afterEach(() => {
    delete process.env["NODETOOL_INSTANCE_ID"];
  });

  it("sweeps every orphaned row on a private database", async () => {
    await createRunning("orphan", null);

    expect(
      await sweepInterruptedJobs(PROCESS_START, { sharedDatabase: false })
    ).toBe(1);
    expect(await statusOf("orphan")).toBe("failed");
  });

  it("skips a shared database when no instance id is set", async () => {
    await createRunning("maybe-peer", null);

    expect(
      await sweepInterruptedJobs(PROCESS_START, { sharedDatabase: true })
    ).toBe(0);
    expect(await statusOf("maybe-peer")).toBe("running");
  });

  it("sweeps this instance's rows on a shared database", async () => {
    process.env["NODETOOL_INSTANCE_ID"] = "machine-a";
    await createRunning("mine", "machine-a");
    await createRunning("peer", "machine-b");

    expect(
      await sweepInterruptedJobs(PROCESS_START, { sharedDatabase: true })
    ).toBe(1);
    expect(await statusOf("mine")).toBe("failed");
    expect(await statusOf("peer")).toBe("running");
  });
});
