import { describe, expect, it } from "vitest";
import { IdMapper, normalizeMessage, normalizeRunRecord } from "../src/core/normalize.js";
import type { RunRecord } from "../src/core/record.js";

describe("normalizeMessage", () => {
  it("remaps ids to stable order-of-first-sight placeholders", () => {
    const mapper = new IdMapper();
    const a = normalizeMessage(
      { type: "node_update", node_id: "abc-123", job_id: "job-xyz" },
      mapper
    );
    const b = normalizeMessage(
      { type: "node_update", node_id: "abc-123", job_id: "job-xyz" },
      mapper
    );
    expect(a).toEqual(b);
    expect(a["node_id"]).toBe("<node:0>");
    expect(a["job_id"]).toBe("<job:0>");
  });

  it("masks timestamp and duration fields", () => {
    const mapper = new IdMapper();
    const msg = normalizeMessage(
      { type: "job_update", timestamp: 12345, duration: 987.6 },
      mapper
    );
    expect(msg["timestamp"]).toBe("<ts>");
    expect(msg["duration"]).toBe("<duration>");
  });

  it("masks asset URLs nested inside a message", () => {
    const mapper = new IdMapper();
    const msg = normalizeMessage(
      {
        type: "output_update",
        value: "asset://workflow-1/abc.png",
        metadata: { thumbnail: "https://cdn.example.com/assets/xyz.png" }
      },
      mapper
    );
    expect(msg["value"]).toBe("<asset>");
    expect((msg["metadata"] as Record<string, unknown>)["thumbnail"]).toBe(
      "<asset>"
    );
  });

  it("leaves ordinary string values untouched", () => {
    const mapper = new IdMapper();
    const msg = normalizeMessage(
      { type: "node_update", node_name: "My Node", status: "completed" },
      mapper
    );
    expect(msg["node_name"]).toBe("My Node");
    expect(msg["status"]).toBe("completed");
  });
});

describe("normalizeRunRecord", () => {
  it("normalizes jobId/workflowId consistently with the frames", () => {
    const record: RunRecord = {
      surface: "kernel",
      jobId: "job-1",
      workflowId: "wf-1",
      startedAt: 0,
      finishedAt: 10,
      durationMs: 10,
      status: "completed",
      error: null,
      params: {},
      frames: [
        {
          seq: 0,
          ts: 0,
          tsSource: "synthetic",
          direction: "server_to_client",
          surface: "kernel",
          channel: "job",
          message: { type: "job_update", status: "running", job_id: "job-1" }
        }
      ]
    };
    const normalized = normalizeRunRecord(record);
    expect(normalized.jobId).toBe("<job:0>");
    expect(normalized.frames[0].message["job_id"]).toBe("<job:0>");
  });
});
