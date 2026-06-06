/**
 * Descriptor validation algebra.
 *
 *   every output must declare a source
 *   forward source cannot be __execution__ or a multi-edge list
 *   aggregate requires collapse, is rejected on buffered nodes
 *   iteration group siblings must share one source
 *   the is_join_node escape hatch only applies on declared join nodes
 *
 * See docs/correlation-design.md §1, §3.
 *
 * The full descriptor-shape validation lives in
 * `packages/node-sdk/tests/correlation-validation.test.ts`; this file pins
 * the kernel-side graph-load validation paths.
 */

import { describe, expect, it } from "vitest";
import {
  runWorkflow,
  iterationOutput,
  forwardOutput,
  aggregateOutput,
  singleOutput,
  dataEdge,
  foreachNode,
  joinNode
} from "../_harness.js";
import { assertJoinRejected } from "../_assertions.js";
import { analyzeCorrelation } from "../../../src/correlation-analysis.js";

describe("descriptor-validation — forward outputs reject __execution__ source", () => {
  it("static analyzer rejects forward with source: __execution__", () => {
    const result = analyzeCorrelation({
      nodes: [
        {
          id: "bad",
          type: "test.Bad",
          outputs: { value: "any" },
          output_correlation: {
            value: { kind: "forward", source: "__execution__" }
          }
        }
      ],
      edges: []
    });
    expect(
      result.issues.some((i) =>
        /forward outputs may not use source "__execution__"/.test(i.message)
      )
    ).toBe(true);
  });
});

describe("descriptor-validation — aggregate rejected on buffered nodes", () => {
  it("buffered node with an aggregate output is rejected at static analysis", () => {
    const result = analyzeCorrelation({
      nodes: [
        {
          id: "fe",
          type: "nodetool.control.ForEach",
          outputs: { output: "any" },
          output_correlation: { output: iterationOutput("items") }
        },
        {
          id: "bad",
          type: "test.BadAgg",
          // No input_mode declared → defaults to buffered.
          outputs: { output: "any" },
          output_correlation: {
            output: aggregateOutput("input_item")
          }
        }
      ],
      edges: [dataEdge("fe", "output", "bad", "input_item", "e1")]
    });
    expect(
      result.issues.some((i) =>
        /aggregate outputs are only valid on input_mode: "stream"/.test(i.message)
      )
    ).toBe(true);
  });
});

describe("descriptor-validation — is_join_node escape hatch is opt-in only", () => {
  it("a plain node receiving incomparable scopes is rejected even if it looks like Zip", async () => {
    const out = await runWorkflow({
      jobId: "validation-not-join",
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
          // Looks like a join (has left + right), but is_join_node is NOT
          // declared. Validation must still reject.
          id: "fake",
          type: "test.FakeZip",
          outputs: { value: "any" },
          output_correlation: { value: singleOutput() }
        }
      ],
      edges: [
        dataEdge("feA", "output", "fake", "left"),
        dataEdge("feB", "output", "fake", "right")
      ],
      executors: { feA: foreachNode(), feB: foreachNode(), fake: joinNode() }
    });
    assertJoinRejected(out.result.error);
  });

  it("the same shape with is_join_node: true is accepted", async () => {
    // We don't run this end-to-end — just verify the static analyzer
    // doesn't flag it as incomparable.
    const result = analyzeCorrelation({
      nodes: [
        {
          id: "feA",
          type: "nodetool.control.ForEach",
          outputs: { output: "any" },
          output_correlation: { output: iterationOutput("items") }
        },
        {
          id: "feB",
          type: "nodetool.control.ForEach",
          outputs: { output: "any" },
          output_correlation: { output: iterationOutput("items") }
        },
        {
          id: "zip",
          type: "test.Zip",
          is_join_node: true,
          outputs: { left: "any", right: "any" },
          output_correlation: {
            left: iterationOutput("zip"),
            right: iterationOutput("zip")
          }
        }
      ],
      edges: [
        dataEdge("feA", "output", "zip", "left", "e1"),
        dataEdge("feB", "output", "zip", "right", "e2")
      ]
    });
    expect(
      result.issues.filter((i) =>
        /independent iteration sources/.test(i.message)
      )
    ).toEqual([]);
  });
});

describe("descriptor-validation — declared outputs without correlation entries default to single", () => {
  it("an output handle with no `output_correlation` entry is treated as single/__execution__", () => {
    const result = analyzeCorrelation({
      nodes: [
        {
          id: "n",
          type: "test.Plain",
          outputs: { value: "any" }
          // no output_correlation
        }
      ],
      edges: []
    });
    expect(result.issues).toEqual([]);
    expect(result.nodes.get("n")?.outputs.get("value")?.scope).toEqual([]);
  });
});
