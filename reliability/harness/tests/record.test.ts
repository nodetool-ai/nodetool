import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import {
  loadRunRecordFromDebugBundle,
  runRecordFromDebugBundle
} from "../src/core/record.js";
import { normalizeRunRecord } from "../src/core/normalize.js";
import { diffNormalizedRecords, streamDiffIsEmpty } from "../src/core/diff.js";

const BUNDLE_DIR = resolve(
  __dirname,
  "../../journeys/linear-text-pipeline/fixtures/debug-bundle"
);

describe("loadRunRecordFromDebugBundle", () => {
  it("round-trips a recorded debug bundle into a RunRecord", async () => {
    const record = await loadRunRecordFromDebugBundle(BUNDLE_DIR);
    expect(record.status).toBe("completed");
    expect(record.error).toBeNull();
    expect(record.workflowId).toBe("linear-text-pipeline");
    expect(record.jobId).toMatch(/^debug-/);
    expect(record.frames.length).toBe(15);
    expect(record.frames[0].message).toMatchObject({
      type: "job_update",
      status: "running"
    });
    expect(record.frames.at(-1)?.message).toMatchObject({
      type: "job_update",
      status: "completed"
    });
    // Per-node-channel grouping: each node gets its own channel key.
    const channels = new Set(record.frames.map((f) => f.channel));
    expect(channels).toEqual(
      new Set(["job", "node:const1", "node:upper1", "node:out1", "control"])
    );
  });

  it("diffs a normalized record against itself empty (C1 done-when)", async () => {
    const record = await loadRunRecordFromDebugBundle(BUNDLE_DIR);
    const normalized = normalizeRunRecord(record);
    const again = normalizeRunRecord(record);
    const diff = diffNormalizedRecords(normalized, again);
    expect(streamDiffIsEmpty(diff)).toBe(true);
  });
});

describe("runRecordFromDebugBundle (pure)", () => {
  it("derives job id and status from the report + first/last job_update", () => {
    const record = runRecordFromDebugBundle(
      { target: { workflowId: "wf-1" }, server: { status: "completed", error: null, durationMs: 12 } },
      [
        { type: "job_update", status: "running", job_id: "job-1" },
        { type: "node_update", node_id: "n1", status: "completed" },
        { type: "job_update", status: "completed", job_id: "job-1" }
      ]
    );
    expect(record.jobId).toBe("job-1");
    expect(record.workflowId).toBe("wf-1");
    expect(record.status).toBe("completed");
    expect(record.frames.map((f) => f.channel)).toEqual([
      "job",
      "node:n1",
      "job"
    ]);
  });
});
