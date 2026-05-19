/**
 * Flag isolation algebra.
 *
 *   NODETOOL_USE_CORRELATION=0 preserves the legacy sync_mode scheduler
 *   flag-on rejects ambiguous graphs at load
 *   flag-off accepts the same graph if the legacy scheduler accepted it
 *   descriptors with the new fields remain backward-compatible
 *
 * See docs/correlation-design.md PR matrix and §1.
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  runWorkflow,
  iterationOutput,
  singleOutput,
  dataEdge,
  foreachNode,
  joinNode
} from "../_harness.js";
import { assertJoinRejected } from "../_assertions.js";
import { isCorrelationEnabled } from "../../../src/correlation-flag.js";

describe("flag-compat — env var observation", () => {
  const orig = process.env.NODETOOL_USE_CORRELATION;
  afterEach(() => {
    if (orig === undefined) delete process.env.NODETOOL_USE_CORRELATION;
    else process.env.NODETOOL_USE_CORRELATION = orig;
  });

  it("returns false when unset", () => {
    delete process.env.NODETOOL_USE_CORRELATION;
    expect(isCorrelationEnabled()).toBe(false);
  });

  it("accepts 1, true, yes, on (case-insensitive)", () => {
    for (const v of ["1", "true", "TRUE", "yes", "On"]) {
      process.env.NODETOOL_USE_CORRELATION = v;
      expect(isCorrelationEnabled()).toBe(true);
    }
  });

  it("rejects 0, false, empty, garbage", () => {
    for (const v of ["0", "false", "", "no", "garbage"]) {
      process.env.NODETOOL_USE_CORRELATION = v;
      expect(isCorrelationEnabled()).toBe(false);
    }
  });
});

describe("flag-compat — flag-on rejects ambiguous graphs", () => {
  it("two independent ForEach branches into a non-join node fail at load under correlation", async () => {
    const out = await runWorkflow({
      jobId: "flag-on-reject",
      flag: "1",
      nodes: [
        {
          id: "feA",
          type: "nodetool.control.ForEach",
          is_streaming_output: true,
          outputs: { output: "any" },
          output_correlation: { output: iterationOutput("items") }
        },
        {
          id: "feB",
          type: "nodetool.control.ForEach",
          is_streaming_output: true,
          outputs: { output: "any" },
          output_correlation: { output: iterationOutput("items") }
        },
        {
          id: "j",
          type: "test.Join",
          outputs: { value: "any" },
          output_correlation: { value: singleOutput() }
        }
      ],
      edges: [
        dataEdge("feA", "output", "j", "left"),
        dataEdge("feB", "output", "j", "right")
      ],
      executors: { feA: foreachNode(), feB: foreachNode(), j: joinNode() }
    });
    assertJoinRejected(out.result.error);
  });
});

describe("flag-compat — flag-off accepts what the legacy scheduler accepted", () => {
  it("the same ambiguous graph loads under flag=0 (legacy scheduler ran it before)", async () => {
    const out = await runWorkflow({
      jobId: "flag-off-accept",
      flag: "0",
      nodes: [
        {
          id: "a",
          type: "nodetool.input.IntegerInput",
          name: "a",
          properties: { value: 1 }
        },
        {
          id: "b",
          type: "nodetool.input.IntegerInput",
          name: "b",
          properties: { value: 2 }
        },
        {
          id: "j",
          type: "test.Join",
          outputs: { value: "any" }
        }
      ],
      edges: [
        dataEdge("a", "value", "j", "left"),
        dataEdge("b", "value", "j", "right")
      ],
      executors: { j: joinNode() }
    });
    expect(out.result.status).toBe("completed");
  });
});

describe("flag-compat — descriptor fields are backward-compatible", () => {
  it("a descriptor with new fields (input_mode, output_correlation, is_join_node) runs unchanged under flag=0", async () => {
    const out = await runWorkflow({
      jobId: "flag-off-new-fields",
      flag: "0",
      nodes: [
        {
          id: "src",
          type: "nodetool.input.IntegerInput",
          name: "items",
          properties: { value: [1, 2] }
        },
        {
          id: "fe",
          type: "nodetool.control.ForEach",
          is_streaming_output: true,
          // New correlation fields, ignored by the legacy scheduler.
          input_mode: "buffered",
          outputs: { output: "any" },
          output_correlation: { output: iterationOutput("items") }
        },
        { id: "sink", type: "test.Sink", is_streaming_input: true }
      ],
      edges: [
        dataEdge("src", "value", "fe", "input_list"),
        dataEdge("fe", "output", "sink", "value")
      ],
      executors: { fe: foreachNode() },
      captureFrom: { sink: ["value"] }
    });
    expect(out.result.status).toBe("completed");
    const envs = out.captured.get("sink")!.get("value")!;
    expect(envs).toHaveLength(2);
    expect(envs.map((e) => e.data)).toEqual([1, 2]);
  });
});
