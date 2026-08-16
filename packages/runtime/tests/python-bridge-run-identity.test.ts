/**
 * Bridge protocol v4: run identity on `execute` / `execute.stream`, the
 * `job.start` / `job.end` boundary, and `models.evict`.
 *
 * Drives the real `WebsocketPythonBridge` against the shared fake worker and
 * reads the frames the worker actually received, so an identity field that
 * never leaves the JS side fails here rather than silently reaching a worker
 * that then has nothing to key its node → model map on.
 */

import { describe, it, expect, afterEach } from "vitest";

import { WebsocketPythonBridge } from "../src/python-websocket-bridge.js";
import {
  startFakeWorker,
  type FakeWorkerHandle
} from "./python-websocket-bridge.test-helpers.js";

describe("bridge protocol v4 — run identity and the run boundary", () => {
  let worker: FakeWorkerHandle | null = null;
  let bridge: WebsocketPythonBridge | null = null;

  afterEach(async () => {
    if (bridge) {
      bridge.close();
      bridge = null;
    }
    if (worker) {
      await worker.close();
      worker = null;
    }
  });

  async function connect(protocolVersion: number): Promise<void> {
    worker = await startFakeWorker(0, { protocolVersion });
    bridge = new WebsocketPythonBridge({
      wsUrl: `ws://127.0.0.1:${worker.port}`
    });
    await bridge.connect();
  }

  it("puts the identity keys on the execute payload", async () => {
    await connect(4);

    await bridge!.execute(
      "test.Node",
      { value: "x" },
      {},
      {},
      undefined,
      {
        nodeId: "node-7",
        jobId: "job-1",
        workflowId: "wf-1",
        userId: "user-1",
        requiresVramGb: 12
      }
    );

    const [frame] = worker!.received("execute");
    expect(frame!.data).toMatchObject({
      node_type: "test.Node",
      node_id: "node-7",
      job_id: "job-1",
      workflow_id: "wf-1",
      user_id: "user-1",
      requires_vram_gb: 12
    });
  });

  it("carries the same identity on execute.stream", async () => {
    await connect(4);

    const stream = bridge!.executeStream(
      "test.Node",
      {},
      {},
      {},
      undefined,
      { nodeId: "node-7", jobId: "job-1" }
    );
    for await (const _chunk of stream) {
      // drain
    }

    const [frame] = worker!.received("execute.stream");
    expect(frame!.data).toMatchObject({ node_id: "node-7", job_id: "job-1" });
  });

  it("omits identity keys the caller could not name", async () => {
    await connect(4);

    await bridge!.execute("test.Node", {}, {}, {}, undefined, {
      nodeId: "node-7"
    });

    const [frame] = worker!.received("execute");
    const data = frame!.data as Record<string, unknown>;
    expect(data.node_id).toBe("node-7");
    // Absent, not null: the worker reads `data.get("job_id")` and must see
    // nothing rather than a null it has to special-case.
    expect("job_id" in data).toBe(false);
    expect("workflow_id" in data).toBe(false);
    expect("requires_vram_gb" in data).toBe(false);
  });

  it("sends identity to a pre-v4 worker too — the keys are additive", async () => {
    // Gating identity on the capability check would starve a worker that DOES
    // understand it whenever worker.status hasn't landed. A v3 worker reads
    // four known keys off `data` and ignores the rest.
    await connect(3);
    expect(bridge!.supportsJobLifecycle()).toBe(false);

    await bridge!.execute("test.Node", {}, {}, {}, undefined, {
      nodeId: "node-7",
      jobId: "job-1"
    });

    const [frame] = worker!.received("execute");
    expect(frame!.data).toMatchObject({ node_id: "node-7", job_id: "job-1" });
  });

  it("brackets a run with job.start / job.end on a v4 worker", async () => {
    await connect(4);
    expect(bridge!.supportsJobLifecycle()).toBe(true);

    await bridge!.jobStart({ jobId: "job-1", workflowId: "wf-1", userId: "u" });
    await bridge!.jobEnd({
      jobId: "job-1",
      workflowId: "wf-1",
      userId: "u",
      reason: "cancelled"
    });

    expect(worker!.received("job.start")[0]!.data).toEqual({
      job_id: "job-1",
      workflow_id: "wf-1",
      user_id: "u"
    });
    expect(worker!.received("job.end")[0]!.data).toEqual({
      job_id: "job-1",
      workflow_id: "wf-1",
      user_id: "u",
      reason: "cancelled"
    });
  });

  it("sends no job.* frame to a pre-v4 worker", async () => {
    // A v3 worker answers an unknown type with `Unknown message type`, so the
    // gate must hold here — unlike the identity keys, these are new messages.
    await connect(3);

    await bridge!.jobStart({ jobId: "job-1" });
    await bridge!.jobEnd({ jobId: "job-1", reason: "completed" });

    expect(worker!.received("job.start")).toHaveLength(0);
    expect(worker!.received("job.end")).toHaveLength(0);
  });

  it("evictModels sends its scope and reports what was dropped", async () => {
    await connect(4);

    const result = await bridge!.evictModels({
      job_id: "job-1",
      target_vram_gb: 8
    });

    expect(result).toEqual({ evicted: ["org/m"], freed_vram_gb: 4 });
    expect(worker!.received("models.evict")[0]!.data).toEqual({
      job_id: "job-1",
      target_vram_gb: 8
    });
  });

  it("evictModels resolves empty on a pre-v4 worker instead of erroring", async () => {
    await connect(3);

    expect(await bridge!.evictModels()).toEqual({ evicted: [] });
    expect(worker!.received("models.evict")).toHaveLength(0);
  });
});
