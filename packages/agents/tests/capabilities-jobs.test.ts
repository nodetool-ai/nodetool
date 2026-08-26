/**
 * The `jobs` capability module.
 *
 * Three things must hold for a ported namespace: the module is drift-clean,
 * every spec's category is the one the gate reads today, and the deprecated
 * class and the capability are the same identity — because they are the same
 * spec. One behavioural round trip per module proves the port runs, not just
 * that it type-checks.
 */

import { describe, expect, it, beforeEach } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { Job, initTestDb } from "@nodetool-ai/models";
import {
  JOB_CAPABILITIES,
  module as jobsModule
} from "../src/capabilities/jobs.js";
import {
  UNGATED,
  createCapabilityRun,
  toolFromCapability
} from "../src/capabilities/index.js";
import {
  capabilityModuleIssues,
  loadCapabilityModule
} from "../src/capabilities/registry.js";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";
import { permissionCategoryFor } from "../src/tools/tool-permissions.js";
import type { Tool } from "../src/tools/base-tool.js";

const USER = "user-jobs";

const ctx = { userId: USER } as unknown as ProcessingContext;

function asTool(name: string): Tool {
  const entry = JOB_CAPABILITIES.find((e) => e.spec.name === name);
  if (!entry) throw new Error(`no jobs capability named "${name}"`);
  return toolFromCapability(entry.spec, entry.impl, () =>
    createCapabilityRun({ context: ctx, gate: UNGATED })
  );
}

beforeEach(() => {
  initTestDb();
});

describe("jobs capability module", () => {
  it("is registered and drift-clean", async () => {
    const loaded = await loadCapabilityModule("jobs");
    expect(loaded).toBe(jobsModule);
    expect(capabilityModuleIssues("jobs", loaded)).toEqual([]);
  });

  it("carries the wire names the tools carried", () => {
    expect(JOB_CAPABILITIES.map((e) => e.spec.name)).toEqual([
      "list_jobs",
      "get_job",
      "get_job_logs",
      "cancel_job"
    ]);
  });

  it("classifies every capability the way the gate does today", () => {
    for (const entry of JOB_CAPABILITIES) {
      expect(entry.spec.category).toBe(permissionCategoryFor(entry.spec.name));
    }
  });

  it("renders as a Tool, spec for spec", () => {
    const classes = [
      toolForCapabilityName("list_jobs"),
      toolForCapabilityName("get_job"),
      toolForCapabilityName("get_job_logs"),
      toolForCapabilityName("cancel_job")
    ];
    for (const tool of classes) {
      const entry = JOB_CAPABILITIES.find((e) => e.spec.name === tool.name);
      expect(entry).toBeDefined();
      expect(tool.description).toBe(entry!.spec.description);
      expect(tool.inputSchema).toEqual(entry!.spec.inputSchema);
    }
  });

  it("keeps the user-facing message templates", () => {
    const listJobs = JOB_CAPABILITIES[0].spec;
    expect(listJobs.userMessage?.({})).toBe("Listing jobs");
    expect(listJobs.userMessage?.({ workflow_id: "wf-1" })).toBe(
      "Listing jobs for workflow wf-1"
    );
  });
});

describe("jobs capabilities against the database", () => {
  it("lists, reads and tails a job the way the tools did", async () => {
    const job = (await Job.create({
      user_id: USER,
      workflow_id: "wf-1",
      status: "completed",
      params: {},
      graph: { nodes: [], edges: [] },
      logs: [{ message: "one" }, { message: "two" }, { message: "three" }]
    })) as Job;

    const listed = (await asTool("list_jobs").process(ctx, {})) as {
      jobs: Array<Record<string, unknown>>;
    };
    expect(listed.jobs.map((j) => j.id)).toContain(job.id);

    const got = (await asTool("get_job").process(ctx, {
      job_id: job.id
    })) as Record<string, unknown>;
    expect(got.id).toBe(job.id);
    expect(got.status).toBe("completed");

    const tail = (await asTool("get_job_logs").process(ctx, {
      job_id: job.id,
      limit: 2
    })) as Record<string, unknown>;
    expect(tail.total_logs).toBe(3);
    expect(tail.logs).toEqual([{ message: "two" }, { message: "three" }]);
  });

  /**
   * A listing reports which jobs exist; `get_job` reports what one produced.
   * They were the same record, so `list_jobs` — which defaults to a hundred —
   * carried every job's full outputs. One agent listing ran to 140 KB of beat
   * sheets, was cut at the 25 KB tool-result cap mid-JSON, and had been called
   * to read a `status` field.
   */
  it("lists jobs without the values they produced", async () => {
    const job = (await Job.create({
      user_id: USER,
      workflow_id: "wf-outputs",
      status: "completed",
      params: {},
      graph: { nodes: [], edges: [] }
    })) as Job;
    job.metadata_json = { outputs: { beat_sheet: "x".repeat(50_000) } };
    await job.save();

    const listed = (await asTool("list_jobs").process(ctx, {
      workflow_id: "wf-outputs"
    })) as { jobs: Array<Record<string, unknown>> };
    const entry = listed.jobs.find((j) => j.id === job.id);
    expect(entry).toBeDefined();
    expect(entry).not.toHaveProperty("outputs");
    // The names are there, so the agent knows a `get_job` is worth making.
    expect(entry?.output_names).toEqual(["beat_sheet"]);
    expect(JSON.stringify(listed).length).toBeLessThan(5_000);

    const got = (await asTool("get_job").process(ctx, {
      job_id: job.id
    })) as Record<string, unknown>;
    expect((got.outputs as Record<string, string>).beat_sheet).toHaveLength(
      50_000
    );
  });

  it("cancels a running job, and says so when there was nothing to cancel", async () => {
    const job = (await Job.create({
      user_id: USER,
      workflow_id: "wf-1",
      status: "running",
      params: {},
      graph: { nodes: [], edges: [] }
    })) as Job;

    const cancelled = (await asTool("cancel_job").process(ctx, {
      job_id: job.id
    })) as Record<string, unknown>;
    expect(cancelled.status).toBe("cancelled");
    expect((await Job.find(USER, job.id))?.status).toBe("cancelled");

    // Cancelling the same job twice is not an error, but it reports that
    // nothing changed — the row is already terminal.
    const again = (await asTool("cancel_job").process(ctx, {
      job_id: job.id
    })) as Record<string, unknown>;
    expect(again.cancelled).toBe(false);
  });

  it("refuses to cancel another user's running job", async () => {
    const theirs = (await Job.create({
      user_id: "someone-else",
      workflow_id: "wf-1",
      status: "running",
      params: {},
      graph: { nodes: [], edges: [] }
    })) as Job;

    const answer = (await asTool("cancel_job").process(ctx, {
      job_id: theirs.id
    })) as Record<string, unknown>;
    expect(answer.cancelled).toBe(false);
    expect((await Job.get(theirs.id))?.status).toBe("running");
  });

  it("reports a job the user does not own", async () => {
    const missing = (await asTool("get_job").process(ctx, {
      job_id: "nope"
    })) as Record<string, unknown>;
    expect(String(missing.error)).toContain("was not found");
  });
});
