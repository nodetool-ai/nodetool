import { beforeEach, describe, expect, it } from "vitest";
import {
  cleanupStorage,
  DEFAULT_STORAGE_RETENTION_POLICY,
  getStorageStatus
} from "../src/storage-maintenance.js";
import { getDb, initTestDb } from "../src/db.js";
import { Job } from "../src/job.js";
import { RunEvent } from "../src/run-event.js";
import { WorkflowVersion } from "../src/workflow-version.js";
import { runEvents } from "../src/schema/run-events.js";

const NOW = new Date("2026-08-24T12:00:00.000Z");

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

async function version(input: {
  id: string;
  workflowId?: string;
  version: number;
  saveType: string;
  ageDays: number;
}): Promise<void> {
  await WorkflowVersion.create<WorkflowVersion>({
    id: input.id,
    workflow_id: input.workflowId ?? "wf-1",
    user_id: "user-1",
    version: input.version,
    save_type: input.saveType,
    created_at: daysAgo(input.ageDays)
  });
}

async function job(input: {
  id: string;
  status: "completed" | "running";
  ageDays: number;
}): Promise<void> {
  await Job.create<Job>({
    id: input.id,
    user_id: "user-1",
    workflow_id: "wf-1",
    job_type: "workflow",
    status: input.status,
    created_at: daysAgo(input.ageDays),
    updated_at: daysAgo(input.ageDays),
    finished_at: input.status === "completed" ? daysAgo(input.ageDays) : null
  });
}

describe("storage maintenance", () => {
  beforeEach(() => initTestDb());

  it("previews only history outside the retention policy", async () => {
    await version({ id: "a1", version: 1, saveType: "autosave", ageDays: 8 });
    await version({ id: "a2", version: 2, saveType: "autosave", ageDays: 1 });
    await version({ id: "m1", version: 3, saveType: "manual", ageDays: 91 });
    await version({
      id: "c1",
      version: 4,
      saveType: "checkpoint",
      ageDays: 500
    });
    await job({ id: "old-job", status: "completed", ageDays: 31 });
    await job({ id: "active-job", status: "running", ageDays: 200 });

    const status = await getStorageStatus(
      "user-1",
      DEFAULT_STORAGE_RETENTION_POLICY,
      NOW
    );

    expect(status.cleanup).toEqual({
      autosaves: 1,
      manualVersions: 1,
      terminalJobs: 1,
      total: 3
    });
    expect(status.jobs).toBe(2);
    expect(status.workflowVersions).toBe(4);
  });

  it("applies the autosave count independently for each workflow", async () => {
    for (let index = 1; index <= 4; index += 1) {
      await version({
        id: `a-${index}`,
        workflowId: "wf-a",
        version: index,
        saveType: "autosave",
        ageDays: 1
      });
      await version({
        id: `b-${index}`,
        workflowId: "wf-b",
        version: index,
        saveType: "autosave",
        ageDays: 1
      });
    }

    const status = await getStorageStatus(
      "user-1",
      { ...DEFAULT_STORAGE_RETENTION_POLICY, maxAutosavesPerWorkflow: 2 },
      NOW
    );

    expect(status.cleanup.autosaves).toBe(4);
  });

  it("deletes old snapshots, terminal jobs, and related run events", async () => {
    await version({
      id: "old-auto",
      version: 1,
      saveType: "autosave",
      ageDays: 8
    });
    await version({ id: "manual", version: 2, saveType: "manual", ageDays: 1 });
    await version({
      id: "checkpoint",
      version: 3,
      saveType: "checkpoint",
      ageDays: 500
    });
    await job({ id: "old-job", status: "completed", ageDays: 31 });
    await job({ id: "active-job", status: "running", ageDays: 200 });
    await RunEvent.create<RunEvent>({
      id: "event-1",
      run_id: "old-job",
      seq: 1,
      event_type: "run_completed",
      event_time: daysAgo(31)
    });

    const result = await cleanupStorage(
      "user-1",
      DEFAULT_STORAGE_RETENTION_POLICY,
      NOW
    );

    expect(result.total).toBe(2);
    expect(await Job.get("old-job")).toBeNull();
    expect(await Job.get("active-job")).not.toBeNull();
    expect(await WorkflowVersion.get("old-auto")).toBeNull();
    expect(await WorkflowVersion.get("manual")).not.toBeNull();
    expect(await WorkflowVersion.get("checkpoint")).not.toBeNull();
    const events = await getDb().select().from(runEvents);
    expect(events).toHaveLength(0);
  });

  it("never touches another user's history", async () => {
    await WorkflowVersion.create<WorkflowVersion>({
      id: "other-auto",
      workflow_id: "wf-other",
      user_id: "user-2",
      version: 1,
      save_type: "autosave",
      created_at: daysAgo(100)
    });
    await cleanupStorage("user-1", DEFAULT_STORAGE_RETENTION_POLICY, NOW);
    expect(await WorkflowVersion.get("other-auto")).not.toBeNull();
  });
});
