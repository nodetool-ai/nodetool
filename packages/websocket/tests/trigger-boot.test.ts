/**
 * Boot wiring for the trigger subsystem: the DB-backed wakeup service, the
 * dispatcher, and the two ingestion adapters, plus their teardown.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { createHash } from "node:crypto";
import {
  closeDb,
  initDb,
  TriggerInput,
  TriggerRegistration
} from "@nodetool-ai/models";
import {
  createTriggerWebhookRoute,
  startTriggerServices,
  triggersEnabled
} from "../src/triggers/boot.js";
import {
  getActiveDispatcher,
  getTriggerWakeupService,
  setTriggerWakeupService
} from "../src/triggers/dispatcher.js";
import type { DispatchedJob } from "../src/triggers/dispatcher.js";

let dbDir: string;

function okJob(jobId: string): DispatchedJob {
  return { jobId, status: "completed", error: null };
}

async function makeRegistration(
  overrides: Partial<{
    kind: string;
    nodeId: string;
    workflowId: string;
    config: Record<string, unknown>;
  }> = {}
): Promise<TriggerRegistration> {
  return (await TriggerRegistration.create<TriggerRegistration>({
    user_id: "user-1",
    workflow_id: overrides.workflowId ?? "wf-1",
    node_id: overrides.nodeId ?? "n1",
    kind: overrides.kind ?? "webhook",
    config_json: overrides.config ?? {},
    enabled: 1
  })) as TriggerRegistration;
}

beforeEach(() => {
  dbDir = mkdtempSync(join(tmpdir(), "trigger-boot-"));
  initDb(join(dbDir, "test.sqlite3"));
  setTriggerWakeupService(null);
});

afterEach(() => {
  setTriggerWakeupService(null);
  closeDb();
  rmSync(dbDir, { recursive: true, force: true });
  vi.useRealTimers();
  delete process.env["NODETOOL_DISABLE_TRIGGERS"];
});

describe("startTriggerServices", () => {
  it("dispatches a backlog input left over from a previous process life", async () => {
    const registration = await makeRegistration();
    // An input written before this "restart", never dispatched.
    await TriggerInput.create<TriggerInput>({
      input_id: "backlog-1",
      run_id: registration.workflow_id,
      node_id: registration.node_id,
      payload_json: { body: { a: 1 } }
    });

    const startJob = vi.fn(async () => okJob("job-1"));
    const services = startTriggerServices({ startJob, scheduler: false, fileWatch: false });
    try {
      await services.drain();

      expect(startJob).toHaveBeenCalledTimes(1);
      expect(startJob.mock.calls[0][0]).toMatchObject({
        workflowId: "wf-1",
        userId: "user-1",
        triggerEvent: { node_id: "n1", input_id: "backlog-1" }
      });
      expect((await TriggerInput.findByInputId("backlog-1"))?.processed).toBe(1);
    } finally {
      await services.stop();
    }
  });

  it("installs a database-backed wakeup service as the process singleton", async () => {
    const services = startTriggerServices({
      startJob: async () => okJob("job-1"),
      scheduler: false,
      fileWatch: false
    });
    try {
      expect(getTriggerWakeupService()).toBe(services.wakeupService);

      await getTriggerWakeupService().deliverTriggerInput({
        runId: "wf-2",
        nodeId: "n9",
        inputId: "evt-1",
        payload: { hi: true }
      });

      // The critical fix: the append landed in the trigger_inputs table.
      const row = await TriggerInput.findByInputId("evt-1");
      expect(row).not.toBeNull();
      expect(row?.run_id).toBe("wf-2");
      expect(row?.node_id).toBe("n9");
      expect(row?.processed).toBe(0);
    } finally {
      await services.stop();
    }
  });

  it("leaves no timers or watchers behind after stop()", async () => {
    vi.useFakeTimers();
    const watchDir = mkdtempSync(join(tmpdir(), "trigger-boot-watch-"));
    try {
      await makeRegistration({
        kind: "file_watch",
        nodeId: "fw",
        config: { path: watchDir }
      });
      await makeRegistration({ kind: "schedule", nodeId: "sched" });

      const before = vi.getTimerCount();
      const services = startTriggerServices({
        startJob: async () => okJob("job-1")
      });
      expect(vi.getTimerCount()).toBeGreaterThan(before);

      await services.stop();
      await services.drain();

      expect(vi.getTimerCount()).toBe(before);
      expect(getActiveDispatcher()).toBeNull();
    } finally {
      rmSync(watchDir, { recursive: true, force: true });
    }
  });

  it("closes a watcher attached by a sweep that was still in flight at stop()", async () => {
    const watchDir = mkdtempSync(join(tmpdir(), "trigger-boot-watch-"));
    await makeRegistration({
      kind: "file_watch",
      nodeId: "fw",
      config: { path: watchDir, debounce_seconds: 0 }
    });

    const startJob = vi.fn(async () => okJob("job-1"));
    // Stop before the initial sweep has finished attaching its watchers.
    const services = startTriggerServices({ startJob, scheduler: false });
    await services.stop();
    await new Promise((r) => setTimeout(r, 100));

    writeFileSync(join(watchDir, "late.txt"), "hi");
    await new Promise((r) => setTimeout(r, 200));

    expect(await TriggerInput.findUnprocessed(10)).toHaveLength(0);
    rmSync(watchDir, { recursive: true, force: true });
  });

  it("is a no-op when triggers are disabled", async () => {
    process.env["NODETOOL_DISABLE_TRIGGERS"] = "1";
    expect(triggersEnabled()).toBe(false);

    await makeRegistration();
    await TriggerInput.create<TriggerInput>({
      input_id: "ignored-1",
      run_id: "wf-1",
      node_id: "n1",
      payload_json: {}
    });

    const startJob = vi.fn(async () => okJob("job-1"));
    const services = startTriggerServices({ startJob });
    try {
      await services.drain();
      expect(services.enabled).toBe(false);
      expect(services.wakeupService).toBeNull();
      expect(startJob).not.toHaveBeenCalled();
      expect(getActiveDispatcher()).toBeNull();
      expect((await TriggerInput.findByInputId("ignored-1"))?.processed).toBe(0);
    } finally {
      await services.stop();
    }
  });

  it("survives a missing database instead of crashing boot", async () => {
    closeDb();
    const services = startTriggerServices({
      startJob: async () => okJob("job-1"),
      scheduler: false,
      fileWatch: false
    });
    await expect(services.stop()).resolves.toBeUndefined();
  });
});

describe("createTriggerWebhookRoute", () => {
  it("routes a delivery into the wired wakeup service and notifies the dispatcher", async () => {
    const secret = "s3cret";
    await makeRegistration({
      config: {
        webhook_token: "tok-1",
        webhook_secret_hash: createHash("sha256").update(secret).digest("hex")
      }
    });

    const startJob = vi.fn(async () => okJob("job-1"));
    const services = startTriggerServices({
      startJob,
      scheduler: false,
      fileWatch: false
    });
    const app = Fastify();
    await app.register(createTriggerWebhookRoute());
    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/webhooks/tok-1",
        headers: { "x-webhook-secret": secret, "content-type": "application/json" },
        payload: JSON.stringify({ hello: 1 })
      });
      expect(res.statusCode).toBe(200);

      await services.drain();
      expect(startJob).toHaveBeenCalledTimes(1);
      expect(startJob.mock.calls[0][0]).toMatchObject({
        triggerEvent: { node_id: "n1", payload: { body: { hello: 1 } } }
      });
    } finally {
      await app.close();
      await services.stop();
    }
  });
});

describe("file-watch through the wired services", () => {
  it("stores a live file event as a trigger input", async () => {
    const watchDir = mkdtempSync(join(tmpdir(), "trigger-boot-watch-"));
    await makeRegistration({
      kind: "file_watch",
      nodeId: "fw",
      config: { path: watchDir, debounce_seconds: 0 }
    });

    const startJob = vi.fn(async () => okJob("job-1"));
    const services = startTriggerServices({
      startJob,
      scheduler: false,
      fileWatchIntervalMs: 50
    });
    try {
      // Give the initial sweep a chance to attach the watcher.
      await new Promise((r) => setTimeout(r, 100));
      writeFileSync(join(watchDir, "note.txt"), "hi");
      await vi.waitFor(async () => {
        const rows = await TriggerInput.findUnprocessed(10);
        expect(rows.length + startJob.mock.calls.length).toBeGreaterThan(0);
      }, 3000);
    } finally {
      await services.stop();
      rmSync(watchDir, { recursive: true, force: true });
    }
  });
});
