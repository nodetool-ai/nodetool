/**
 * `ExecutionSession` brackets every run with the Python worker's `job.start` /
 * `job.end` boundary (bridge protocol v4).
 *
 * `job.end` is the caller the worker's `release_nodes()` never had, so what
 * matters here is not the happy path but that the boundary closes on the
 * abnormal ones too. A `job.end` that only fires on clean completion moves the
 * model-cache leak to the failure path instead of fixing it.
 */
import { describe, it, expect } from "vitest";
import type { JobBoundary, PythonJobLifecycle } from "@nodetool-ai/runtime";
import { ExecutionSession } from "../src/index.js";
import { buildTestRegistry } from "./fixtures.js";

const NO_BRIDGE = async () => null;

function recordingLifecycle(supported = true): PythonJobLifecycle & {
  starts: JobBoundary[];
  ends: JobBoundary[];
} {
  const starts: JobBoundary[] = [];
  const ends: JobBoundary[] = [];
  return {
    starts,
    ends,
    supportsJobLifecycle: () => supported,
    jobStart: async (job) => {
      starts.push(job);
    },
    jobEnd: async (job) => {
      ends.push(job);
    }
  };
}

/** A run that settles cleanly. */
const VALUE_GRAPH = {
  nodes: [
    { id: "v", type: "nodetool.input.Value", properties: {} },
    { id: "double", type: "test.execution.Double", properties: {} }
  ],
  edges: [
    {
      source: "v",
      sourceHandle: "output",
      target: "double",
      targetHandle: "value"
    }
  ]
};

/** Start params for {@link VALUE_GRAPH}. */
const VALUE_PARAMS = { v: 21 };

/** A run that never ends on its own — cancel or time out to settle it. */
const LOOP_GRAPH = {
  nodes: [{ id: "loop", type: "test.execution.Loop", properties: {} }],
  edges: []
};

describe("ExecutionSession — job.start / job.end boundary", () => {
  it("opens the boundary before the run and closes it on completion", async () => {
    const lifecycle = recordingLifecycle();
    const session = await ExecutionSession.create({
      graph: VALUE_GRAPH,
      registry: buildTestRegistry(),
      bridgeFactory: NO_BRIDGE,
      jobLifecycleBridge: lifecycle,
      jobId: "job-1",
      workflowId: "wf-1",
      params: VALUE_PARAMS
    });

    const result = await session.result;
    expect(result.status).toBe("completed");

    expect(lifecycle.starts).toEqual([
      { jobId: "job-1", workflowId: "wf-1", userId: "1" }
    ]);
    expect(lifecycle.ends).toEqual([
      { jobId: "job-1", workflowId: "wf-1", userId: "1", reason: "completed" }
    ]);
  });

  it("closes the boundary on a cancelled run", async () => {
    const lifecycle = recordingLifecycle();
    const session = await ExecutionSession.create({
      graph: LOOP_GRAPH,
      registry: buildTestRegistry(),
      bridgeFactory: NO_BRIDGE,
      jobLifecycleBridge: lifecycle,
      jobId: "job-2"
    });

    await new Promise((r) => setTimeout(r, 30));
    session.cancel("user-requested");
    expect((await session.result).status).toBe("cancelled");

    expect(lifecycle.ends).toHaveLength(1);
    expect(lifecycle.ends[0]!.reason).toBe("cancelled");
  });

  it("closes the boundary on a run abandoned by the timeout", async () => {
    const lifecycle = recordingLifecycle();
    const session = await ExecutionSession.create({
      graph: LOOP_GRAPH,
      registry: buildTestRegistry(),
      bridgeFactory: NO_BRIDGE,
      jobLifecycleBridge: lifecycle,
      jobId: "job-3",
      limits: { runTimeoutMs: 30 }
    });

    expect((await session.result).status).toBe("cancelled");
    expect(lifecycle.ends[0]).toMatchObject({
      jobId: "job-3",
      reason: "cancelled"
    });
  });

  it("closes the boundary on a failed run", async () => {
    const lifecycle = recordingLifecycle();
    const session = await ExecutionSession.create({
      graph: {
        nodes: [{ id: "x", type: "test.execution.DoesNotExist", properties: {} }],
        edges: []
      },
      registry: buildTestRegistry(),
      bridgeFactory: NO_BRIDGE,
      jobLifecycleBridge: lifecycle,
      jobId: "job-4"
    });

    expect((await session.result).status).toBe("failed");
    expect(lifecycle.ends[0]).toMatchObject({
      jobId: "job-4",
      reason: "failed"
    });
  });

  it("does not block the run on the boundary call", async () => {
    // jobStart is fire-and-forget: a worker that never answers must not turn
    // into a run that never starts.
    let released: (() => void) | null = null;
    const lifecycle: PythonJobLifecycle = {
      supportsJobLifecycle: () => true,
      jobStart: () => new Promise<void>((r) => (released = r)),
      jobEnd: async () => {}
    };

    const session = await ExecutionSession.create({
      graph: VALUE_GRAPH,
      registry: buildTestRegistry(),
      bridgeFactory: NO_BRIDGE,
      jobLifecycleBridge: lifecycle,
      jobId: "job-5",
      params: VALUE_PARAMS
    });

    expect((await session.result).status).toBe("completed");
    released?.();
  });

  it("runs unchanged when the host wires no lifecycle bridge", async () => {
    const session = await ExecutionSession.create({
      graph: VALUE_GRAPH,
      registry: buildTestRegistry(),
      bridgeFactory: NO_BRIDGE,
      jobId: "job-6",
      params: VALUE_PARAMS
    });

    expect((await session.result).status).toBe("completed");
  });
});
