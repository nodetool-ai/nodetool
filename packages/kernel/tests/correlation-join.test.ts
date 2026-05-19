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

  it("runtime: Zip pairs by parent-prefix + differing-root index, shares one minted token across sibling handles", async () => {
    const originalFlag = process.env[FLAG];
    process.env[FLAG] = "1";

    try {
      // Sinks for both Zip outputs — we verify the two siblings carry the
      // SAME minted `zip:zip` token per pair (i.e. they are one logical
      // item, not two independent items).
      const leftCaptured: MessageEnvelope[] = [];
      const rightCaptured: MessageEnvelope[] = [];

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
          // Intentionally out of order so a FIFO join would mispair.
          await outputs.emit("value", "B1", {
            lineage: { "b:items": { index: 1 } }
          });
          await outputs.emit("value", "B0", {
            lineage: { "b:items": { index: 0 } }
          });
        }
      };

      // Inline Zip mirroring ZipNode's actual strategy: project to parent
      // prefix (empty here) + differing-root index, then emitGroup with
      // sibling handles so the actor mints ONE token per pair.
      const zip: NodeExecutor = {
        async process() {
          return {};
        },
        async run(inputs: NodeInputs, outputs: NodeOutputs) {
          const parentScope = inputs.invocationScope();
          const parentSet = new Set(parentScope);
          const findDiff = (handle: string): string => {
            const scope = inputs.scopeFor(handle);
            const d = scope.filter((r) => !parentSet.has(r));
            if (d.length !== 1) throw new Error(`Zip: bad scope on ${handle}`);
            return d[0];
          };
          const ld = findDiff("left");
          const rd = findDiff("right");
          const projParent = (env: MessageEnvelope) => {
            if (parentScope.length === 0) return "";
            return parentScope
              .map((r) => `${r}=${env.correlation_lineage[r]?.index ?? "?"}`)
              .join(",");
          };
          const lefts = new Map<string, { data: unknown; index: number }>();
          const rights = new Map<string, { data: unknown; index: number }>();
          const flush = async () => {
            for (const [k, l] of lefts) {
              const r = rights.get(k);
              if (!r) continue;
              lefts.delete(k);
              rights.delete(k);
              await outputs.emitGroup({
                left: l.data,
                right: r.data,
                index: l.index
              });
            }
          };
          const leftLoop = (async () => {
            for await (const env of inputs.streamWithEnvelope("left")) {
              const idx = env.correlation_lineage[ld].index;
              lefts.set(`${projParent(env)}|${idx}`, {
                data: env.data,
                index: idx
              });
              await flush();
            }
          })();
          const rightLoop = (async () => {
            for await (const env of inputs.streamWithEnvelope("right")) {
              const idx = env.correlation_lineage[rd].index;
              rights.set(`${projParent(env)}|${idx}`, {
                data: env.data,
                index: idx
              });
              await flush();
            }
          })();
          await Promise.all([leftLoop, rightLoop]);
          await flush();
        }
      };

      const sinkExec = (
        handle: string,
        bucket: MessageEnvelope[]
      ): NodeExecutor => ({
        async process() {
          return {};
        },
        async run(inputs: NodeInputs) {
          for await (const env of inputs.streamWithEnvelope(handle)) {
            bucket.push(env);
          }
        }
      });

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
          outputs: { left: "any", right: "any", index: "int" },
          output_correlation: {
            left: { kind: "iteration", source: "__execution__", group: "zip" },
            right: { kind: "iteration", source: "__execution__", group: "zip" },
            index: { kind: "iteration", source: "__execution__", group: "zip" }
          }
        },
        { id: "leftSink", type: "test.Sink", is_streaming_input: true },
        { id: "rightSink", type: "test.Sink", is_streaming_input: true }
      ];
      const edges: Edge[] = [
        { id: "ea", source: "a", sourceHandle: "value", target: "zip", targetHandle: "left" },
        { id: "eb", source: "b", sourceHandle: "value", target: "zip", targetHandle: "right" },
        { id: "el", source: "zip", sourceHandle: "left", target: "leftSink", targetHandle: "value" },
        { id: "er", source: "zip", sourceHandle: "right", target: "rightSink", targetHandle: "value" }
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
            case "leftSink":
              return sinkExec("value", leftCaptured);
            case "rightSink":
              return sinkExec("value", rightCaptured);
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

      // The pair set is {A0↔B0, A1↔B1}. Emission order depends on which
      // side arrived second for each bucket — we only care about identity.
      expect(leftCaptured).toHaveLength(2);
      expect(rightCaptured).toHaveLength(2);

      // Identity assertion: at each emit index, left and right share the
      // SAME minted zip:zip token. Independent per-slot minting would make
      // the two sinks see different tokens — that was the bug this fixes.
      for (let i = 0; i < leftCaptured.length; i++) {
        const lt = leftCaptured[i].correlation_lineage["zip:zip"];
        const rt = rightCaptured[i].correlation_lineage["zip:zip"];
        expect(lt).toBeDefined();
        expect(rt).toBeDefined();
        expect(lt!.index).toBe(rt!.index);
      }

      // And the resulting pairs are correctly aligned: at each emit, the
      // left and right values are from the same source iteration index.
      const pairs = leftCaptured.map((e, i) => `${e.data}+${rightCaptured[i].data}`);
      expect(pairs.sort()).toEqual(["A0+B0", "A1+B1"]);

      // Two pairs, distinct shared tokens.
      const tokenIndices = leftCaptured.map(
        (e) => e.correlation_lineage["zip:zip"]!.index
      );
      expect(new Set(tokenIndices).size).toBe(2);
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
