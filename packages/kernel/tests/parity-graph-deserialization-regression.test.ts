/**
 * Regression tests for Python graph-deserialization parity.
 *
 * These lock in the recent parity fixes:
 *  - API graph `data` is normalized to kernel `properties`
 *  - static property values shadowed by incoming edges are removed
 *  - malformed/dangling edges are skipped by default
 *  - a buffered actor with only empty-scope inputs fires once with the latest
 *    sticky value per handle (correlation redesign — see
 *    docs/correlation-design.md §4)
 */

import { describe, it, expect } from "vitest";
import { Graph, GraphValidationError } from "../src/graph.js";
import { NodeActor, type NodeExecutor } from "../src/actor.js";
import { NodeInbox } from "../src/inbox.js";
import type { NodeDescriptor } from "@nodetool-ai/protocol";
import type { NodeAnalysis } from "../src/correlation-analysis.js";

const EMPTY_ANALYSIS: NodeAnalysis = {
  invocationScope: [],
  inputs: new Map(),
  outputs: new Map()
};

function makeNode(overrides: Partial<NodeDescriptor> = {}): NodeDescriptor {
  return { id: "test_node", type: "test.Node", ...overrides };
}

function trackingExecutor(
  processFn: (inputs: Record<string, unknown>) => Record<string, unknown>
): { executor: NodeExecutor; calls: Array<Record<string, unknown>> } {
  const calls: Array<Record<string, unknown>> = [];
  return {
    executor: {
      async process(inputs) {
        calls.push({ ...inputs });
        return processFn(inputs);
      }
    },
    calls
  };
}

describe("Python parity — Graph.fromDict normalization", () => {
  it("maps API graph node data into kernel properties", () => {
    const graph = Graph.fromDict({
      nodes: [
        {
          id: "n1",
          type: "test.Node",
          data: { threshold: 0.75, label: "primary" }
        }
      ],
      edges: []
    });

    expect(graph.findNode("n1")?.properties).toEqual({
      threshold: 0.75,
      label: "primary"
    });
  });

  it("drops property values that are supplied by incoming edges", () => {
    const graph = Graph.fromDict({
      nodes: [
        { id: "source", type: "test.Source", data: { out: 1 } },
        { id: "target", type: "test.Target", data: { value: 999, keep: "ok" } }
      ],
      edges: [
        {
          source: "source",
          sourceHandle: "out",
          target: "target",
          targetHandle: "value"
        }
      ]
    });

    expect(graph.findNode("target")?.properties).toEqual({ keep: "ok" });
  });

  it("skips malformed and dangling edges by default", () => {
    const graph = Graph.fromDict({
      nodes: [
        { id: "a", type: "test.A" },
        { id: "b", type: "test.B" }
      ],
      edges: [
        { source: "a", sourceHandle: "out", target: "b", targetHandle: "in" },
        { source: "a", target: "b" },
        {
          source: "ghost",
          sourceHandle: "out",
          target: "b",
          targetHandle: "extra"
        }
      ]
    });

    expect(graph.edges).toEqual([
      { source: "a", sourceHandle: "out", target: "b", targetHandle: "in" }
    ]);
  });

  it("throws on malformed edges when skipErrors is false", () => {
    expect(() =>
      Graph.fromDict(
        {
          nodes: [
            { id: "a", type: "test.A" },
            { id: "b", type: "test.B" }
          ],
          edges: [{ source: "a", target: "b" }]
        },
        { skipErrors: false }
      )
    ).toThrow(GraphValidationError);
  });
});

describe("buffered actor default (empty-scope) semantics", () => {
  it("fires once with the latest sticky value per handle", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("left", 1);
    inbox.addUpstream("right", 1);

    const { executor, calls } = trackingExecutor((inputs) => ({
      value: inputs
    }));
    const actor = new NodeActor({
      node: makeNode(),
      inbox,
      executor,
      sendOutputs: async () => {},
      emitMessage: () => {},
      correlation: EMPTY_ANALYSIS
    });

    await inbox.put("left", 1);
    await inbox.put("right", 2);
    await inbox.put("left", 3);
    inbox.markSourceDone("left");
    inbox.markSourceDone("right");

    await actor.run();

    // Empty-scope (the default with no correlation scope) is sticky-latest with
    // a single fire: each handle keeps its most recent value and the node runs
    // once. left=3 overwrites left=1, so the actor fires with {left:3, right:2}.
    // (zip_all/positional pairing was removed in the correlation redesign.)
    expect(calls).toEqual([{ left: 3, right: 2 }]);
  });
});
