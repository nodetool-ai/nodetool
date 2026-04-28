/**
 * Regression tests for Python graph-deserialization parity.
 *
 * These lock in the recent parity fixes:
 *  - API graph `data` is normalized to kernel `properties`
 *  - static property values shadowed by incoming edges are removed
 *  - malformed/dangling edges are skipped by default
 *  - omitted sync_mode falls back to Python's default: "on_any"
 */

import { describe, it, expect } from "vitest";
import { Graph, GraphValidationError } from "../src/graph.js";
import { NodeActor, type NodeExecutor } from "../src/actor.js";
import { NodeInbox } from "../src/inbox.js";
import type { NodeDescriptor } from "@nodetool-ai/protocol";

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

describe("Python parity — omitted sync_mode default", () => {
  it("defaults buffered actors to on_any semantics", async () => {
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
      emitMessage: () => {}
    });

    await inbox.put("left", 1);
    await inbox.put("right", 2);
    await inbox.put("left", 3);
    inbox.markSourceDone("left");
    inbox.markSourceDone("right");

    await actor.run();

    expect(calls).toEqual([
      { left: 1, right: 2 },
      { left: 3, right: 2 }
    ]);
  });
});
