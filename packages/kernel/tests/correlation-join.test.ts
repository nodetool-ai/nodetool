/**
 * Explicit join validation (PR 4 of docs/correlation-design.md).
 *
 * Asserts:
 *  - Static analyzer allows incomparable input scopes on `is_join_node`
 *    nodes and reports the common parent prefix as their invocation scope.
 *  - Zip's output scope is `commonParentPrefix + [zipRoot]`.
 *  - Iteration-root naming for join nodes uses the `${nodeId}:zip` /
 *    `${nodeId}:cross` convention.
 *  - Non-join nodes still reject incomparable scopes.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Edge, NodeDescriptor } from "@nodetool-ai/protocol";
import { analyzeCorrelation } from "../src/correlation-analysis.js";
import { WorkflowRunner } from "../src/runner.js";
import type { MessageEnvelope } from "../src/inbox.js";
import type { NodeExecutor } from "../src/actor.js";
import type { NodeInputs, NodeOutputs } from "../src/io.js";

const FLAG = "NODETOOL_USE_CORRELATION";

function dataEdge(
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
  id?: string
): Edge {
  return { id, source, sourceHandle, target, targetHandle };
}

describe("static analysis — join nodes", () => {
  it("accepts incomparable inputs on a Zip node", () => {
    const nodes: NodeDescriptor[] = [
      {
        id: "fe1",
        type: "nodetool.control.ForEach",
        outputs: { output: "any" },
        output_correlation: {
          output: { kind: "iteration", source: "__execution__", group: "items" }
        }
      },
      {
        id: "fe2",
        type: "nodetool.control.ForEach",
        outputs: { output: "any" },
        output_correlation: {
          output: { kind: "iteration", source: "__execution__", group: "items" }
        }
      },
      {
        id: "zip",
        type: "nodetool.control.Zip",
        is_join_node: true,
        outputs: { left: "any", right: "any" },
        output_correlation: {
          left: { kind: "iteration", source: "__execution__", group: "zip" },
          right: { kind: "iteration", source: "__execution__", group: "zip" }
        }
      }
    ];
    const edges: Edge[] = [
      dataEdge("fe1", "output", "zip", "left", "e1"),
      dataEdge("fe2", "output", "zip", "right", "e2")
    ];
    const result = analyzeCorrelation({ nodes, edges });
    expect(result.issues).toEqual([]);
    // Common parent prefix is empty (both inputs are root iterations).
    expect(result.nodes.get("zip")?.invocationScope).toEqual([]);
    // Output scope = commonPrefix + [zipRoot]
    expect(result.nodes.get("zip")?.outputs.get("left")?.scope).toEqual([
      "zip:zip"
    ]);
    expect(result.nodes.get("zip")?.outputs.get("right")?.scope).toEqual([
      "zip:zip"
    ]);
  });

  it("Zip beneath a common parent emits output at parent + zipRoot", () => {
    const nodes: NodeDescriptor[] = [
      {
        id: "outer",
        type: "nodetool.control.ForEach",
        outputs: { output: "any" },
        output_correlation: {
          output: { kind: "iteration", source: "__execution__", group: "items" }
        }
      },
      {
        id: "innerA",
        type: "nodetool.control.ForEach",
        outputs: { output: "any" },
        output_correlation: {
          output: { kind: "iteration", source: "__execution__", group: "items" }
        }
      },
      {
        id: "innerB",
        type: "nodetool.control.ForEach",
        outputs: { output: "any" },
        output_correlation: {
          output: { kind: "iteration", source: "__execution__", group: "items" }
        }
      },
      {
        id: "zip",
        type: "nodetool.control.Zip",
        is_join_node: true,
        outputs: { left: "any", right: "any" },
        output_correlation: {
          left: { kind: "iteration", source: "__execution__", group: "zip" },
          right: { kind: "iteration", source: "__execution__", group: "zip" }
        }
      }
    ];
    const edges: Edge[] = [
      dataEdge("outer", "output", "innerA", "input_list", "e1"),
      dataEdge("outer", "output", "innerB", "input_list", "e2"),
      dataEdge("innerA", "output", "zip", "left", "e3"),
      dataEdge("innerB", "output", "zip", "right", "e4")
    ];
    const result = analyzeCorrelation({ nodes, edges });
    expect(result.issues).toEqual([]);
    // Common parent prefix is ["outer:items"].
    expect(result.nodes.get("zip")?.invocationScope).toEqual(["outer:items"]);
    expect(result.nodes.get("zip")?.outputs.get("left")?.scope).toEqual([
      "outer:items",
      "zip:zip"
    ]);
  });

  it("runtime: Zip pairs values from incomparable iteration sources", async () => {
    const originalFlag = process.env[FLAG];
    process.env[FLAG] = "1";

    try {
      const captured: { envelopes: MessageEnvelope[] } = { envelopes: [] };

      const seedA: NodeExecutor = {
        async process() {
          return {};
        },
        async run(_inputs: NodeInputs, outputs: NodeOutputs) {
          await outputs.emit("value", "A0", {
            lineage: { "a:items": { index: 0 } }
          });
          await outputs.emit("value", "A1", {
            lineage: { "a:items": { index: 1 } }
          });
        }
      };
      const seedB: NodeExecutor = {
        async process() {
          return {};
        },
        async run(_inputs: NodeInputs, outputs: NodeOutputs) {
          // Note: intentionally emit out of order to verify pairing by
          // lineage, not arrival.
          await outputs.emit("value", "B1", {
            lineage: { "b:items": { index: 1 } }
          });
          await outputs.emit("value", "B0", {
            lineage: { "b:items": { index: 0 } }
          });
        }
      };
      // Test-only Zip: pair by left.index == right.index using lineage.
      const zip: NodeExecutor = {
        async process() {
          return {};
        },
        async run(inputs: NodeInputs, outputs: NodeOutputs) {
          const lefts = new Map<number, unknown>();
          const rights = new Map<number, unknown>();
          const flush = async () => {
            for (const [k, l] of lefts) {
              if (rights.has(k)) {
                const r = rights.get(k);
                lefts.delete(k);
                rights.delete(k);
                await outputs.emit("pair", `${l}+${r}`);
              }
            }
          };
          const leftLoop = (async () => {
            for await (const e of inputs.streamWithEnvelope("left")) {
              const idx = e.correlation_lineage["a:items"]?.index ?? -1;
              lefts.set(idx, e.data);
              await flush();
            }
          })();
          const rightLoop = (async () => {
            for await (const e of inputs.streamWithEnvelope("right")) {
              const idx = e.correlation_lineage["b:items"]?.index ?? -1;
              rights.set(idx, e.data);
              await flush();
            }
          })();
          await Promise.all([leftLoop, rightLoop]);
          await flush();
        }
      };
      const sink: NodeExecutor = {
        async process() {
          return {};
        },
        async run(inputs: NodeInputs) {
          for await (const env of inputs.streamWithEnvelope("value")) {
            captured.envelopes.push(env);
          }
        }
      };

      const nodes: NodeDescriptor[] = [
        {
          id: "a",
          type: "test.SeedA",
          is_streaming_input: true,
          outputs: { value: "any" },
          output_correlation: {
            value: { kind: "iteration", source: "__execution__", group: "items" }
          }
        },
        {
          id: "b",
          type: "test.SeedB",
          is_streaming_input: true,
          outputs: { value: "any" },
          output_correlation: {
            value: { kind: "iteration", source: "__execution__", group: "items" }
          }
        },
        {
          id: "zip",
          type: "test.Zip",
          is_streaming_input: true,
          is_join_node: true,
          outputs: { pair: "any" },
          output_correlation: {
            pair: { kind: "iteration", source: "__execution__", group: "zip" }
          }
        },
        {
          id: "sink",
          type: "test.Sink",
          is_streaming_input: true
        }
      ];
      const edges: Edge[] = [
        { id: "e1", source: "a", sourceHandle: "value", target: "zip", targetHandle: "left" },
        { id: "e2", source: "b", sourceHandle: "value", target: "zip", targetHandle: "right" },
        { id: "e3", source: "zip", sourceHandle: "pair", target: "sink", targetHandle: "value" }
      ];

      const runner = new WorkflowRunner("zip-job", {
        resolveExecutor: (node) => {
          switch (node.id) {
            case "a":
              return seedA;
            case "b":
              return seedB;
            case "zip":
              return zip;
            case "sink":
              return sink;
            default:
              throw new Error(`No executor for ${node.id}`);
          }
        }
      });
      const result = await runner.run(
        { job_id: "zip-job", params: {} },
        { nodes, edges }
      );
      expect(result.status).toBe("completed");
      const values = captured.envelopes.map((e) => e.data).sort();
      expect(values).toEqual(["A0+B0", "A1+B1"]);
      // Each emitted pair carries the new zip iteration root.
      for (const env of captured.envelopes) {
        expect(env.correlation_lineage["zip:zip"]).toBeDefined();
      }
    } finally {
      if (originalFlag === undefined) {
        delete process.env[FLAG];
      } else {
        process.env[FLAG] = originalFlag;
      }
    }
  });

  it("non-join nodes still reject incomparable inputs", () => {
    const nodes: NodeDescriptor[] = [
      {
        id: "fe1",
        type: "nodetool.control.ForEach",
        outputs: { output: "any" },
        output_correlation: {
          output: { kind: "iteration", source: "__execution__", group: "items" }
        }
      },
      {
        id: "fe2",
        type: "nodetool.control.ForEach",
        outputs: { output: "any" },
        output_correlation: {
          output: { kind: "iteration", source: "__execution__", group: "items" }
        }
      },
      {
        id: "plain",
        type: "test.Join",
        outputs: { value: "any" },
        output_correlation: {
          value: { kind: "single", source: "__execution__" }
        }
      }
    ];
    const edges: Edge[] = [
      dataEdge("fe1", "output", "plain", "left", "e1"),
      dataEdge("fe2", "output", "plain", "right", "e2")
    ];
    const result = analyzeCorrelation({ nodes, edges });
    expect(result.issues.length).toBeGreaterThan(0);
  });
});
