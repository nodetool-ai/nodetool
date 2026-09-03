import { beforeEach, describe, expect, it } from "vitest";
import {
  cleanupStorage,
  DEFAULT_STORAGE_RETENTION_POLICY,
  getStorageStatus
} from "../src/storage-maintenance.js";
import { getDb, initTestDb } from "../src/db.js";
import { Job } from "../src/job.js";
import { Prediction } from "../src/prediction.js";
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

async function runEvent(input: {
  id: string;
  runId: string;
  seq: number;
  ageDays: number;
}): Promise<void> {
  await RunEvent.create<RunEvent>({
    id: input.id,
    run_id: input.runId,
    seq: input.seq,
    event_type: "NodeCompleted",
    event_time: daysAgo(input.ageDays),
    node_id: "node-1",
    payload: { prompt: "a private prompt", output: "a private answer" }
  });
}

async function prediction(input: {
  id: string;
  userId?: string;
  ageDays: number;
}): Promise<void> {
  await Prediction.create<Prediction>({
    id: input.id,
    user_id: input.userId ?? "user-1",
    provider: "openai",
    model: "gpt-4o-mini",
    status: "completed",
    cost: 0.0125,
    input_tokens: 1000,
    output_tokens: 250,
    total_tokens: 1250,
    created_at: daysAgo(input.ageDays),
    completed_at: daysAgo(input.ageDays),
    logs: "raw provider log line",
    parameters: { prompt: "a private prompt" },
    metadata: { user_agent: "nodetool/1.0" }
  });
}

async function eventIds(): Promise<string[]> {
  const rows = await getDb().select().from(runEvents);
  return rows.map((row: { id: string }) => row.id).sort();
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
      runEvents: 0,
      redactedPredictions: 0,
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

  it("sweeps run events past the window on runs that survive the pass", async () => {
    await job({ id: "active-job", status: "running", ageDays: 200 });
    await runEvent({
      id: "stale-event",
      runId: "active-job",
      seq: 1,
      ageDays: 31
    });
    await runEvent({
      id: "fresh-event",
      runId: "active-job",
      seq: 2,
      ageDays: 2
    });
    await Job.create<Job>({
      id: "other-job",
      user_id: "user-2",
      workflow_id: "wf-other",
      job_type: "workflow",
      status: "running",
      created_at: daysAgo(200),
      updated_at: daysAgo(200)
    });
    await runEvent({
      id: "other-event",
      runId: "other-job",
      seq: 1,
      ageDays: 90
    });

    const status = await getStorageStatus(
      "user-1",
      DEFAULT_STORAGE_RETENTION_POLICY,
      NOW
    );
    expect(status.runEvents).toBe(2);
    expect(status.cleanup.runEvents).toBe(1);
    expect(status.cleanup.total).toBe(1);

    const result = await cleanupStorage(
      "user-1",
      DEFAULT_STORAGE_RETENTION_POLICY,
      NOW
    );

    expect(result.runEvents).toBe(1);
    // The run itself is untouched; only its expired events are gone. Another
    // user's events are out of scope because run_events is joined to jobs.
    expect(await Job.get("active-job")).not.toBeNull();
    expect(await eventIds()).toEqual(["fresh-event", "other-event"]);
  });

  it("keeps every run event when the window still covers them", async () => {
    await job({ id: "active-job", status: "running", ageDays: 200 });
    await runEvent({
      id: "stale-event",
      runId: "active-job",
      seq: 1,
      ageDays: 31
    });
    await runEvent({
      id: "fresh-event",
      runId: "active-job",
      seq: 2,
      ageDays: 2
    });

    const policy = {
      ...DEFAULT_STORAGE_RETENTION_POLICY,
      runEventRetentionDays: 3650
    };
    const status = await getStorageStatus("user-1", policy, NOW);
    expect(status.cleanup.runEvents).toBe(0);

    const result = await cleanupStorage("user-1", policy, NOW);
    expect(result.runEvents).toBe(0);
    expect(await eventIds()).toEqual(["fresh-event", "stale-event"]);
  });

  it("redacts the payload of an expired prediction and keeps the billing row", async () => {
    await prediction({ id: "old-prediction", ageDays: 401 });

    const status = await getStorageStatus(
      "user-1",
      DEFAULT_STORAGE_RETENTION_POLICY,
      NOW
    );
    expect(status.predictionsWithPayload).toBe(1);
    expect(status.cleanup.redactedPredictions).toBe(1);
    // Redaction is not deletion, so it stays out of the deleted total.
    expect(status.cleanup.total).toBe(0);

    const result = await cleanupStorage(
      "user-1",
      DEFAULT_STORAGE_RETENTION_POLICY,
      NOW
    );
    expect(result.redactedPredictions).toBe(1);

    const row = await Prediction.find("old-prediction");
    expect(row).not.toBeNull();
    expect(row?.parameters).toBeNull();
    expect(row?.metadata).toBeNull();
    expect(row?.logs).toBeNull();
    expect(row?.cost).toBe(0.0125);
    expect(row?.input_tokens).toBe(1000);
    expect(row?.output_tokens).toBe(250);
    expect(row?.total_tokens).toBe(1250);
    expect(row?.model).toBe("gpt-4o-mini");
    expect(row?.provider).toBe("openai");
    expect(row?.status).toBe("completed");
    expect(row?.created_at).toBe(daysAgo(401));
    expect(row?.completed_at).toBe(daysAgo(401));

    // A second pass has nothing left to redact.
    const second = await cleanupStorage(
      "user-1",
      DEFAULT_STORAGE_RETENTION_POLICY,
      NOW
    );
    expect(second.redactedPredictions).toBe(0);
  });

  it("leaves recent predictions and other users' predictions intact", async () => {
    await prediction({ id: "recent-prediction", ageDays: 10 });
    await prediction({
      id: "other-prediction",
      userId: "user-2",
      ageDays: 401
    });

    const result = await cleanupStorage(
      "user-1",
      DEFAULT_STORAGE_RETENTION_POLICY,
      NOW
    );

    expect(result.redactedPredictions).toBe(0);
    expect((await Prediction.find("recent-prediction"))?.parameters).toEqual({
      prompt: "a private prompt"
    });
    expect((await Prediction.find("other-prediction"))?.parameters).toEqual({
      prompt: "a private prompt"
    });
  });

  it("previews exactly what the cleanup then removes", async () => {
    await version({ id: "a1", version: 1, saveType: "autosave", ageDays: 8 });
    await version({ id: "m1", version: 2, saveType: "manual", ageDays: 91 });
    await job({ id: "old-job", status: "completed", ageDays: 31 });
    await job({ id: "active-job", status: "running", ageDays: 200 });
    await runEvent({
      id: "stale-event",
      runId: "active-job",
      seq: 1,
      ageDays: 31
    });
    await runEvent({
      id: "fresh-event",
      runId: "active-job",
      seq: 2,
      ageDays: 2
    });
    await prediction({ id: "old-prediction", ageDays: 401 });

    const preview = (
      await getStorageStatus("user-1", DEFAULT_STORAGE_RETENTION_POLICY, NOW)
    ).cleanup;
    const result = await cleanupStorage(
      "user-1",
      DEFAULT_STORAGE_RETENTION_POLICY,
      NOW
    );

    const { completedAt, ...counts } = result;
    expect(completedAt).toBe(NOW.toISOString());
    expect(counts).toEqual(preview);
    // Every sweep in this fixture has work to do — a sweep that matched
    // nothing would report zeroes and fail here.
    expect(preview).toEqual({
      autosaves: 1,
      manualVersions: 1,
      terminalJobs: 1,
      runEvents: 1,
      redactedPredictions: 1,
      total: 4
    });

    const after = await getStorageStatus(
      "user-1",
      DEFAULT_STORAGE_RETENTION_POLICY,
      NOW
    );
    expect(after.cleanup.total).toBe(0);
    expect(after.cleanup.redactedPredictions).toBe(0);
  });

  it("keeps automatic cleanup off by default and names the new windows", () => {
    expect(DEFAULT_STORAGE_RETENTION_POLICY.automaticCleanup).toBe(false);
    expect(DEFAULT_STORAGE_RETENTION_POLICY.runEventRetentionDays).toBe(30);
    expect(DEFAULT_STORAGE_RETENTION_POLICY.predictionRetentionDays).toBe(400);
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
