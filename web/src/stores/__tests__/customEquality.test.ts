/**
 * Tests for customEquality.ts
 * Tests the custom equality function used for Zustand store history optimization
 */

import { describe, test, expect } from "@jest/globals";
import { customEquality } from "../customEquality";
import type { PartializedNodeStore } from "../NodeStore";
import { Edge, Node } from "@xyflow/react";
import type { NodeData } from "../NodeData";

describe("customEquality", () => {
  const createMockNode = (
    id: string,
    overrides?: Partial<Node<NodeData>>
  ): Node<NodeData> => ({
    id,
    type: "testType",
    data: {
      properties: {},
      dynamic_properties: {},
      workflow_id: "workflow-1"
    },
    position: { x: 0, y: 0 },
    ...overrides
  } as Node<NodeData>);

  const createMockEdge = (
    id: string,
    overrides?: Partial<Edge>
  ): Edge => ({
    id,
    source: "source-1",
    target: "target-1",
    ...overrides
  });

  const defaultWorkflow = {
    id: "workflow-1",
    name: "Test",
    access: "private",
    description: "",
    thumbnail: "",
    tags: [],
    run_mode: "workflow",
    settings: {},
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString()
  };

  const createMockStore = (
    overrides?: Partial<PartializedNodeStore>
  ): PartializedNodeStore => ({
    nodes: [],
    edges: [],
    workflow: defaultWorkflow,
    ...overrides
  }) as PartializedNodeStore;

  describe("with undefined or null inputs", () => {
    test("returns false when both previous and current are undefined", () => {
      expect(customEquality(undefined, undefined)).toBe(false);
    });

    test("returns false when previous is undefined", () => {
      const current = createMockStore();
      expect(customEquality(undefined, current)).toBe(false);
    });

    test("returns false when current is undefined", () => {
      const previous = createMockStore();
      expect(customEquality(previous, undefined)).toBe(false);
    });

    test("returns false when previous is null", () => {
      const current = createMockStore();
      expect(customEquality(undefined, current)).toBe(false);
    });

    test("returns false when current is null", () => {
      const previous = createMockStore();
      expect(customEquality(previous, undefined)).toBe(false);
    });
  });

  describe("with different node array lengths", () => {
    test("returns false when previous has no nodes", () => {
      const previous = createMockStore({ nodes: undefined });
      const current = createMockStore({ nodes: [createMockNode("node-1")] });

      expect(customEquality(previous, current)).toBe(false);
    });

    test("returns false when current has no nodes", () => {
      const previous = createMockStore({ nodes: [createMockNode("node-1")] });
      const current = createMockStore({ nodes: undefined });

      expect(customEquality(previous, current)).toBe(false);
    });

    test("returns false when node arrays have different lengths", () => {
      const previous = createMockStore({
        nodes: [createMockNode("node-1"), createMockNode("node-2")]
      });
      const current = createMockStore({
        nodes: [createMockNode("node-1")]
      });

      expect(customEquality(previous, current)).toBe(false);
    });
  });

  describe("with different edge array lengths", () => {
    test("returns false when previous has no edges", () => {
      const previous = createMockStore({ edges: undefined });
      const current = createMockStore({ edges: [createMockEdge("edge-1")] });

      expect(customEquality(previous, current)).toBe(false);
    });

    test("returns false when current has no edges", () => {
      const previous = createMockStore({ edges: [createMockEdge("edge-1")] });
      const current = createMockStore({ edges: undefined });

      expect(customEquality(previous, current)).toBe(false);
    });

    test("returns false when edge arrays have different lengths", () => {
      const previous = createMockStore({
        edges: [createMockEdge("edge-1"), createMockEdge("edge-2")]
      });
      const current = createMockStore({
        edges: [createMockEdge("edge-1")]
      });

      expect(customEquality(previous, current)).toBe(false);
    });
  });

  describe("comparing nodes", () => {
    test("returns false when node ids differ", () => {
      const previous = createMockStore({
        nodes: [createMockNode("node-1")]
      });
      const current = createMockStore({
        nodes: [createMockNode("node-2")]
      });

      expect(customEquality(previous, current)).toBe(false);
    });

    test("returns false when node types differ", () => {
      const previous = createMockStore({
        nodes: [createMockNode("node-1", { type: "type-a" })]
      });
      const current = createMockStore({
        nodes: [createMockNode("node-1", { type: "type-b" })]
      });

      expect(customEquality(previous, current)).toBe(false);
    });

    test("returns false when node collapsed state differs", () => {
      const previous = createMockStore({
        nodes: [
          createMockNode("node-1", {
            data: { ...createMockNode("node-1").data, collapsed: false } as NodeData
          })
        ]
      });
      const current = createMockStore({
        nodes: [
          createMockNode("node-1", {
            data: { ...createMockNode("node-1").data, collapsed: true } as NodeData
          })
        ]
      });

      expect(customEquality(previous, current)).toBe(false);
    });

    test("returns false when node bypassed state differs", () => {
      const previous = createMockStore({
        nodes: [
          createMockNode("node-1", {
            data: { ...createMockNode("node-1").data, bypassed: false } as NodeData
          })
        ]
      });
      const current = createMockStore({
        nodes: [
          createMockNode("node-1", {
            data: { ...createMockNode("node-1").data, bypassed: true } as NodeData
          })
        ]
      });

      expect(customEquality(previous, current)).toBe(false);
    });

    test("returns false when node properties differ", () => {
      const previous = createMockStore({
        nodes: [
          createMockNode("node-1", {
            data: {
              ...createMockNode("node-1").data,
              properties: { prop1: "value1" }
            } as NodeData
          })
        ]
      });
      const current = createMockStore({
        nodes: [
          createMockNode("node-1", {
            data: {
              ...createMockNode("node-1").data,
              properties: { prop1: "value2" }
            } as NodeData
          })
        ]
      });

      expect(customEquality(previous, current)).toBe(false);
    });

    test("returns false when node position.x differs", () => {
      const previous = createMockStore({
        nodes: [createMockNode("node-1", { position: { x: 0, y: 0 } })]
      });
      const current = createMockStore({
        nodes: [createMockNode("node-1", { position: { x: 100, y: 0 } })]
      });

      expect(customEquality(previous, current)).toBe(false);
    });

    test("returns false when node position.y differs", () => {
      const previous = createMockStore({
        nodes: [createMockNode("node-1", { position: { x: 0, y: 0 } })]
      });
      const current = createMockStore({
        nodes: [createMockNode("node-1", { position: { x: 0, y: 100 } })]
      });

      expect(customEquality(previous, current)).toBe(false);
    });

    test("returns true when nodes are same", () => {
      const node = createMockNode("node-1", {
        position: { x: 100, y: 200 },
        data: {
          ...createMockNode("node-1").data,
          properties: { prop1: "value1", prop2: "value2" },
          collapsed: true,
          bypassed: false
        } as NodeData
      });

      const previous = createMockStore({ nodes: [node] });
      const current = createMockStore({ nodes: [{ ...node }] });

      expect(customEquality(previous, current)).toBe(true);
    });
  });

  describe("comparing edges", () => {
    test("returns false when edge ids differ", () => {
      const previous = createMockStore({
        edges: [createMockEdge("edge-1")]
      });
      const current = createMockStore({
        edges: [createMockEdge("edge-2")]
      });

      expect(customEquality(previous, current)).toBe(false);
    });

    test("returns false when edge source differs", () => {
      const previous = createMockStore({
        edges: [createMockEdge("edge-1", { source: "source-a" })]
      });
      const current = createMockStore({
        edges: [createMockEdge("edge-1", { source: "source-b" })]
      });

      expect(customEquality(previous, current)).toBe(false);
    });

    test("returns false when edge target differs", () => {
      const previous = createMockStore({
        edges: [createMockEdge("edge-1", { target: "target-a" })]
      });
      const current = createMockStore({
        edges: [createMockEdge("edge-1", { target: "target-b" })]
      });

      expect(customEquality(previous, current)).toBe(false);
    });

    test("returns false when edge sourceHandle differs", () => {
      const previous = createMockStore({
        edges: [createMockEdge("edge-1", { sourceHandle: "handle-a" })]
      });
      const current = createMockStore({
        edges: [createMockEdge("edge-1", { sourceHandle: "handle-b" })]
      });

      expect(customEquality(previous, current)).toBe(false);
    });

    test("returns false when edge targetHandle differs", () => {
      const previous = createMockStore({
        edges: [createMockEdge("edge-1", { targetHandle: "handle-a" })]
      });
      const current = createMockStore({
        edges: [createMockEdge("edge-1", { targetHandle: "handle-b" })]
      });

      expect(customEquality(previous, current)).toBe(false);
    });

    test("returns true when edges are same", () => {
      const edge = createMockEdge("edge-1", {
        source: "source-1",
        target: "target-1",
        sourceHandle: "source-handle",
        targetHandle: "target-handle"
      });

      const previous = createMockStore({ edges: [edge] });
      const current = createMockStore({ edges: [{ ...edge }] });

      expect(customEquality(previous, current)).toBe(true);
    });
  });

  describe("comparing workflows", () => {
    test("returns false when workflows differ", () => {
      const previous = createMockStore({
        workflow: { id: "workflow-1", name: "Test", access: "private", description: "", thumbnail: "", tags: [], run_mode: "workflow", settings: {}, updated_at: new Date().toISOString(), created_at: new Date().toISOString() }
      });
      const current = createMockStore({
        workflow: { id: "workflow-2", name: "Test 2", access: "private", description: "", thumbnail: "", tags: [], run_mode: "workflow", settings: {}, updated_at: new Date().toISOString(), created_at: new Date().toISOString() }
      });

      expect(customEquality(previous, current)).toBe(false);
    });

    test("uses shallow comparison for workflow", () => {
      const workflow = { id: "workflow-1", name: "Test", access: "private", description: "", thumbnail: "", tags: [], run_mode: "workflow", settings: {}, updated_at: new Date().toISOString(), created_at: new Date().toISOString() };
      const previous = createMockStore({ workflow });
      const current = createMockStore({ workflow: { ...workflow } });

      expect(customEquality(previous, current)).toBe(true);
    });
  });

  describe("with multiple nodes and edges", () => {
    test("returns true when all nodes and edges match", () => {
      const nodes = [
        createMockNode("node-1", { position: { x: 0, y: 0 } }),
        createMockNode("node-2", { position: { x: 100, y: 100 } }),
        createMockNode("node-3", { position: { x: 200, y: 200 } })
      ];

      const edges = [
        createMockEdge("edge-1", { source: "node-1", target: "node-2" }),
        createMockEdge("edge-2", { source: "node-2", target: "node-3" })
      ];

      const previous = createMockStore({ nodes, edges });
      const current = createMockStore({
        nodes: nodes.map(n => ({ ...n })),
        edges: edges.map(e => ({ ...e }))
      });

      expect(customEquality(previous, current)).toBe(true);
    });

    test("returns false when one node differs", () => {
      const nodes1 = [
        createMockNode("node-1", { position: { x: 0, y: 0 } }),
        createMockNode("node-2", { position: { x: 100, y: 100 } })
      ];

      const nodes2 = [
        createMockNode("node-1", { position: { x: 0, y: 0 } }),
        createMockNode("node-2", { position: { x: 999, y: 999 } })
      ];

      const previous = createMockStore({ nodes: nodes1 });
      const current = createMockStore({ nodes: nodes2 });

      expect(customEquality(previous, current)).toBe(false);
    });

    test("returns false when one edge differs", () => {
      const edges1 = [
        createMockEdge("edge-1", { source: "node-1", target: "node-2" })
      ];

      const edges2 = [
        createMockEdge("edge-1", { source: "node-1", target: "node-999" })
      ];

      const previous = createMockStore({ edges: edges1 });
      const current = createMockStore({ edges: edges2 });

      expect(customEquality(previous, current)).toBe(false);
    });
  });
});
