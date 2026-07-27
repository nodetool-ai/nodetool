/**
 * Mutation-kill tests for src/graph.ts.
 *
 * Each test pins one externally-visible contract that a surviving Stryker
 * mutant would break: the type guards around `dynamic_properties` /
 * `propertyTypes` in `fromDict`, and every branch plus the error payload of
 * `validateDataEdgeSourceHandles`.
 */

import { describe, it, expect } from "vitest";
import { Graph, GraphValidationError } from "../src/graph.js";
import type { Edge, NodeDescriptor } from "@nodetool-ai/protocol";

function n(
  id: string,
  type: string,
  extra: Partial<NodeDescriptor> = {}
): NodeDescriptor {
  return { id, type, ...extra };
}

function e(
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
  extra: Partial<Edge> = {}
): Edge {
  return { source, sourceHandle, target, targetHandle, ...extra };
}

const propsOf = (graph: Graph, id: string): Record<string, unknown> =>
  (graph.findNode(id)?.properties ?? {}) as Record<string, unknown>;

// ---------------------------------------------------------------------------
// fromDict – dynamic_properties merge guard
// ---------------------------------------------------------------------------

describe("Graph.fromDict – dynamic_properties type guard", () => {
  it("ignores a non-object dynamic_properties instead of spreading it", () => {
    // Arrange: a string dynamic_properties — Object.assign would copy its
    // character indices ("0", "1", "2") onto the node's properties.
    const data = {
      nodes: [
        {
          id: "a",
          type: "test.A",
          properties: { keep: 1 },
          dynamic_properties: "abc"
        }
      ],
      edges: []
    };

    // Act
    const graph = Graph.fromDict(data);

    // Assert
    expect(propsOf(graph, "a")).toEqual({ keep: 1 });
  });

  it("merges a real dynamic_properties object into properties", () => {
    // Arrange
    const data = {
      nodes: [
        {
          id: "a",
          type: "test.A",
          properties: { keep: 1 },
          dynamic_properties: { extra: "v" }
        }
      ],
      edges: []
    };

    // Act
    const graph = Graph.fromDict(data);

    // Assert
    expect(propsOf(graph, "a")).toEqual({ keep: 1, extra: "v" });
  });
});

// ---------------------------------------------------------------------------
// fromDict – propertyTypes guard (only active with allowUndefinedProperties:false)
// ---------------------------------------------------------------------------

describe("Graph.fromDict – propertyTypes type guard", () => {
  it("treats a null propertyTypes as 'no declaration' and keeps properties", () => {
    // Arrange: typeof null === "object", so only the != null guard stops
    // Object.keys(null) from throwing.
    const data = {
      nodes: [
        { id: "a", type: "test.A", properties: { foo: 1 }, propertyTypes: null }
      ],
      edges: []
    };

    // Act
    const graph = Graph.fromDict(data, {
      allowUndefinedProperties: false,
      skipErrors: false
    });

    // Assert
    expect(propsOf(graph, "a")).toEqual({ foo: 1 });
  });

  it("treats a non-object propertyTypes as 'no declaration' and keeps properties", () => {
    // Arrange: Object.keys("ab") would yield ["0","1"], making "foo" undeclared.
    const data = {
      nodes: [
        { id: "a", type: "test.A", properties: { foo: 1 }, propertyTypes: "ab" }
      ],
      edges: []
    };

    // Act
    const graph = Graph.fromDict(data, {
      allowUndefinedProperties: false,
      skipErrors: false
    });

    // Assert
    expect(propsOf(graph, "a")).toEqual({ foo: 1 });
  });

  it("keeps rejecting undeclared properties when propertyTypes is a real map", () => {
    // Arrange
    const data = {
      nodes: [
        {
          id: "a",
          type: "test.A",
          properties: { foo: 1 },
          propertyTypes: { bar: "str" }
        }
      ],
      edges: []
    };

    // Act / Assert
    expect(() =>
      Graph.fromDict(data, {
        allowUndefinedProperties: false,
        skipErrors: false
      })
    ).toThrow(/Property foo does not exist on node a/);
  });
});

// ---------------------------------------------------------------------------
// validateDataEdgeSourceHandles – skip branches
// ---------------------------------------------------------------------------

describe("Graph.validateDataEdgeSourceHandles – skipped edges", () => {
  it("does not check sourceHandle on control edges", () => {
    // Arrange: "ctrl" is not a declared output of the source node.
    const graph = new Graph({
      nodes: [
        n("a", "test.A", { outputs: { output: "str" } }),
        n("b", "test.B")
      ],
      edges: [
        e("a", "ctrl", "b", "__control__", {
          id: "c1",
          edge_type: "control"
        })
      ]
    });

    // Act / Assert
    expect(() => graph.validateDataEdgeSourceHandles()).not.toThrow();
  });

  it("does not check edges whose source node is missing from the graph", () => {
    // Arrange: dangling source — endpoint existence is validateEdgeEndpoints' job.
    const graph = new Graph({
      nodes: [n("b", "test.B")],
      edges: [e("ghost", "output", "b", "in", { id: "d1" })]
    });

    // Act / Assert
    expect(() => graph.validateDataEdgeSourceHandles()).not.toThrow();
  });

  it("does not check nodes without a non-empty static outputs map", () => {
    // Arrange
    const noOutputs = new Graph({
      nodes: [n("a", "test.A"), n("b", "test.B")],
      edges: [e("a", "whatever", "b", "in", { id: "d1" })]
    });
    const emptyOutputs = new Graph({
      nodes: [n("a", "test.A", { outputs: {} }), n("b", "test.B")],
      edges: [e("a", "whatever", "b", "in", { id: "d2" })]
    });

    // Act / Assert
    expect(() => noOutputs.validateDataEdgeSourceHandles()).not.toThrow();
    expect(() => emptyOutputs.validateDataEdgeSourceHandles()).not.toThrow();
  });

  it("still checks handles when dynamic_outputs is present but empty", () => {
    // Arrange: only a *non-empty* dynamic_outputs map suppresses the check.
    const graph = new Graph({
      nodes: [
        n("a", "test.A", { outputs: { output: "str" }, dynamic_outputs: {} }),
        n("b", "test.B")
      ],
      edges: [e("a", "missing", "b", "in", { id: "d1" })]
    });

    // Act / Assert
    expect(() => graph.validateDataEdgeSourceHandles()).toThrow(
      GraphValidationError
    );
  });

  it("skips the check when the node declares non-empty dynamic_outputs", () => {
    // Arrange
    const graph = new Graph({
      nodes: [
        n("a", "test.A", {
          outputs: { output: "str" },
          dynamic_outputs: { extra: { type: "str" } }
        }),
        n("b", "test.B")
      ],
      edges: [e("a", "extra", "b", "in", { id: "d1" })]
    });

    // Act / Assert
    expect(() => graph.validateDataEdgeSourceHandles()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// validateDataEdgeSourceHandles – error payload
// ---------------------------------------------------------------------------

describe("Graph.validateDataEdgeSourceHandles – error payload", () => {
  const failingGraph = (nodeType: string, edgeId?: string): Graph =>
    new Graph({
      nodes: [
        n("src", nodeType, { outputs: { output: "str" } }),
        n("dst", "test.Dst")
      ],
      edges: [e("src", "missing", "dst", "in", edgeId ? { id: edgeId } : {})]
    });

  const catchError = (graph: Graph): GraphValidationError => {
    try {
      graph.validateDataEdgeSourceHandles();
    } catch (err) {
      return err as GraphValidationError;
    }
    throw new Error("expected validateDataEdgeSourceHandles to throw");
  };

  it("names the edge id, the unknown handle, the node and its type", () => {
    // Arrange
    const graph = failingGraph("test.Src", "e1");

    // Act
    const err = catchError(graph);

    // Assert
    expect(err.message).toBe(
      'Edge e1 references unknown output "missing" on node "src" (test.Src)'
    );
  });

  it("falls back to the synthetic edge id when the edge carries none", () => {
    // Arrange
    const graph = failingGraph("test.Src");

    // Act
    const err = catchError(graph);

    // Assert
    expect(err.message).toBe(
      'Edge src:missing->dst:in references unknown output "missing" on node "src" (test.Src)'
    );
  });

  it("omits the type suffix entirely when the source node has no type", () => {
    // Arrange
    const graph = failingGraph("", "e1");

    // Act
    const err = catchError(graph);

    // Assert
    expect(err.message).toBe(
      'Edge e1 references unknown output "missing" on node "src"'
    );
  });

  it("reports one issue pointing at the node, type and handle", () => {
    // Arrange
    const graph = failingGraph("test.Src", "e1");

    // Act
    const err = catchError(graph);

    // Assert
    expect(err.issues).toEqual([
      {
        nodeId: "src",
        nodeType: "test.Src",
        property: "missing",
        message: 'Unknown output "missing"'
      }
    ]);
  });
});
