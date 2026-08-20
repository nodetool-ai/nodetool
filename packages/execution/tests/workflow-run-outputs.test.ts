/**
 * What a settled job row keeps of the run's outputs. A detached run has nowhere
 * else to leave its answer, so the size rule this pins is the difference
 * between `get_job` reporting a result and reporting only a status.
 */
import { describe, expect, it } from "vitest";
import {
  MAX_PERSISTED_LOG_ENTRIES,
  MAX_PERSISTED_OUTPUT_BYTES,
  persistableLogs,
  persistableOutputs
} from "../src/service/workflow-run.js";
import { collectExecutionSummary } from "../src/debug/collector.js";

describe("persistableOutputs", () => {
  it("keeps ordinary outputs — refs and short strings — as they are", () => {
    const outputs = {
      script: ["Power up your night."],
      ad_video: [{ type: "video", uri: "asset://abc.mp4" }]
    };
    expect(persistableOutputs(outputs)).toBe(outputs);
  });

  it("keeps an empty result rather than dropping the key", () => {
    expect(persistableOutputs({})).toEqual({});
  });

  it("replaces an oversized result with the handle names and the reason", () => {
    const big = { transcript: ["x".repeat(MAX_PERSISTED_OUTPUT_BYTES + 1)] };
    const stored = persistableOutputs(big) as Record<string, unknown>;
    expect(stored.omitted).toBe(true);
    expect(stored.handles).toEqual(["transcript"]);
    expect(String(stored.reason)).toContain(String(MAX_PERSISTED_OUTPUT_BYTES));
  });

  it("treats an unserializable result as oversized instead of throwing", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic["self"] = cyclic;
    const stored = persistableOutputs(cyclic) as Record<string, unknown>;
    expect(stored.omitted).toBe(true);
    expect(stored.handles).toEqual(["self"]);
  });
});

describe("persistableLogs", () => {
  it("keeps the run's log lines and adds one per failed node", () => {
    const summary = collectExecutionSummary([
      { type: "log_update", node_id: "n1", node_name: "Add Clips", severity: "warning", content: "clip skipped" },
      { type: "node_update", node_id: "n1", node_name: "Add Clips", node_type: "nodetool.timeline.AddClips", status: "error", error: "no renderable clips" }
    ]);
    expect(persistableLogs(summary)).toEqual([
      {
        severity: "warning",
        node_id: "n1",
        node_name: "Add Clips",
        content: "clip skipped"
      },
      {
        severity: "error",
        node_id: "n1",
        node_name: "Add Clips",
        content: "nodetool.timeline.AddClips failed: no renderable clips"
      }
    ]);
  });

  it("keeps the tail when a run logs more than the row holds", () => {
    const summary = collectExecutionSummary(
      Array.from({ length: MAX_PERSISTED_LOG_ENTRIES + 5 }, (_, i) => ({
        type: "log_update",
        node_id: "n",
        severity: "info",
        content: `line ${i}`
      }))
    );
    const logs = persistableLogs(summary);
    expect(logs).toHaveLength(MAX_PERSISTED_LOG_ENTRIES);
    expect(logs[logs.length - 1].content).toBe(
      `line ${MAX_PERSISTED_LOG_ENTRIES + 4}`
    );
  });

  it("truncates a single runaway line", () => {
    const summary = collectExecutionSummary([
      { type: "log_update", node_id: null, severity: "info", content: "x".repeat(5000) }
    ]);
    expect(persistableLogs(summary)[0].content).toHaveLength(2000);
  });
});
