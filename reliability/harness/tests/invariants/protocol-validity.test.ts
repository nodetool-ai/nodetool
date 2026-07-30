import { describe, expect, it } from "vitest";
import { checkProtocolValidity } from "../../src/core/invariants/protocol-validity.js";
import { makeFrame } from "../../src/core/record.js";
import type { RunRecord } from "../../src/core/record.js";

function baseRecord(frames: RunRecord["frames"]): RunRecord {
  return {
    surface: "ws-server",
    jobId: "job-1",
    workflowId: "wf-1",
    startedAt: 0,
    finishedAt: frames.length,
    durationMs: frames.length,
    status: "completed",
    error: null,
    params: {},
    frames
  };
}

describe("checkProtocolValidity: passing fixtures", () => {
  it("reports nothing for well-formed frames in both directions", () => {
    const record = baseRecord([
      makeFrame(0, "ws-server", "client_to_server", {
        command: "run_job",
        data: { job_id: "job-1", params: {} },
        request_id: "r1"
      }),
      makeFrame(1, "ws-server", "client_to_server", { type: "ping", ts: 1 }),
      makeFrame(2, "ws-server", "server_to_client", {
        type: "job_update",
        status: "running",
        job_id: "job-1"
      }),
      makeFrame(3, "ws-server", "server_to_client", {
        type: "node_update",
        node_id: "n1",
        node_name: "n1",
        node_type: "test.Node",
        status: "completed"
      }),
      makeFrame(4, "ws-server", "server_to_client", { type: "pong", ts: 2 }),
      // Ad hoc, type-less reply — intentionally unvalidated.
      makeFrame(5, "ws-server", "server_to_client", { error: "invalid_command" }),
      makeFrame(6, "ws-server", "server_to_client", {
        type: "job_update",
        status: "completed",
        job_id: "job-1"
      })
    ]);

    expect(checkProtocolValidity(record)).toEqual([]);
  });
});

describe("checkProtocolValidity: failing fixtures", () => {
  it("flags a server_to_client node_update missing required fields", () => {
    const record = baseRecord([
      makeFrame(0, "ws-server", "server_to_client", {
        type: "node_update",
        node_id: "n1",
        // node_name and node_type are required by nodeUpdateSchema.
        status: "completed"
      })
    ]);

    const violations = checkProtocolValidity(record);
    expect(violations).toEqual([
      expect.objectContaining({
        invariant: "protocol-validity.server-to-client-schema",
        frameIndex: 0
      })
    ]);
  });

  it("flags a client_to_server run_job command whose graph shape is wrong", () => {
    const record = baseRecord([
      makeFrame(0, "ws-server", "client_to_server", {
        command: "run_job",
        data: { graph: { nodes: "not-an-array", edges: [] } }
      })
    ]);

    const violations = checkProtocolValidity(record);
    expect(violations).toEqual([
      expect.objectContaining({
        invariant: "protocol-validity.client-to-server-data",
        frameIndex: 0
      })
    ]);
  });

  it("flags a client_to_server control frame (ping) with a malformed field", () => {
    const record = baseRecord([
      makeFrame(0, "ws-server", "client_to_server", { type: "ping", ts: "not-a-number" })
    ]);

    const violations = checkProtocolValidity(record);
    expect(violations).toEqual([
      expect.objectContaining({
        invariant: "protocol-validity.client-to-server-control",
        frameIndex: 0
      })
    ]);
  });
});
