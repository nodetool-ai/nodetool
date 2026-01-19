import { customEquality } from "../customEquality";
import { Edge, Node } from "@xyflow/react";
import { NodeData } from "../NodeData";

describe("customEquality", () => {
  const createNode = (overrides: Partial<Node<NodeData>> = {}): Node<NodeData> => ({
    id: "node1",
    type: "default",
    data: {
      collapsed: false,
      bypassed: false,
      properties: {},
      selectable: true,
      dynamic_properties: {},
      workflow_id: "wf1",
    },
    position: { x: 0, y: 0 },
    ...overrides,
  });

  const createEdge = (overrides: Partial<Edge> = {}): Edge => ({
    id: "e1",
    source: "node1",
    target: "node2",
    sourceHandle: null,
    targetHandle: null,
    ...overrides,
  });

  const createStoreState = (overrides: { nodes?: Node<NodeData>[]; edges?: Edge[]; workflow?: any } = {}) => ({
    nodes: [createNode()],
    edges: [createEdge()],
    workflow: { id: "wf1", name: "Test" },
    ...overrides,
  });

  describe("edge cases", () => {
    it("returns false when previous is undefined", () => {
      const current = createStoreState();
      expect(customEquality(undefined, current)).toBe(false);
    });

    it("returns false when current is undefined", () => {
      const previous = createStoreState();
      expect(customEquality(previous, undefined)).toBe(false);
    });

    it("returns false when both are undefined", () => {
      expect(customEquality(undefined, undefined)).toBe(false);
    });

    it("returns false when previous.nodes is undefined", () => {
      const previous = { ...createStoreState(), nodes: undefined };
      const current = createStoreState();
      expect(customEquality(previous as any, current)).toBe(false);
    });

    it("returns false when current.nodes is undefined", () => {
      const previous = createStoreState();
      const current = { ...createStoreState(), nodes: undefined };
      expect(customEquality(previous, current as any)).toBe(false);
    });

    it("returns false when node counts differ", () => {
      const previous = createStoreState({ nodes: [createNode(), createNode({ id: "node2" })] });
      const current = createStoreState({ nodes: [createNode()] });
      expect(customEquality(previous, current)).toBe(false);
    });

    it("returns false when edge counts differ", () => {
      const previous = createStoreState({ edges: [createEdge(), createEdge({ id: "e2" })] });
      const current = createStoreState({ edges: [createEdge()] });
      expect(customEquality(previous, current)).toBe(false);
    });
  });

  describe("node comparison", () => {
    it("returns true when all nodes are equal", () => {
      const previous = createStoreState();
      const current = createStoreState();
      expect(customEquality(previous, current)).toBe(true);
    });

    it("returns false when node id changes", () => {
      const previous = createStoreState({ nodes: [createNode({ id: "node1" })] });
      const current = createStoreState({ nodes: [createNode({ id: "node2" })] });
      expect(customEquality(previous, current)).toBe(false);
    });

    it("returns false when node type changes", () => {
      const previous = createStoreState({ nodes: [createNode({ type: "default" })] });
      const current = createStoreState({ nodes: [createNode({ type: "custom" })] });
      expect(customEquality(previous, current)).toBe(false);
    });

    it("returns false when node collapsed state changes", () => {
      const previous = createStoreState({ nodes: [createNode({ data: { collapsed: false, bypassed: false, properties: {}, selectable: true, dynamic_properties: {}, workflow_id: "wf1" } })] });
      const current = createStoreState({ nodes: [createNode({ data: { collapsed: true, bypassed: false, properties: {}, selectable: true, dynamic_properties: {}, workflow_id: "wf1" } })] });
      expect(customEquality(previous, current)).toBe(false);
    });

    it("returns false when node bypassed state changes", () => {
      const previous = createStoreState({ nodes: [createNode({ data: { collapsed: false, bypassed: false, properties: {}, selectable: true, dynamic_properties: {}, workflow_id: "wf1" } })] });
      const current = createStoreState({ nodes: [createNode({ data: { collapsed: false, bypassed: true, properties: {}, selectable: true, dynamic_properties: {}, workflow_id: "wf1" } })] });
      expect(customEquality(previous, current)).toBe(false);
    });

    it("returns false when node position changes", () => {
      const previous = createStoreState({ nodes: [createNode({ position: { x: 0, y: 0 } })] });
      const current = createStoreState({ nodes: [createNode({ position: { x: 100, y: 100 } })] });
      expect(customEquality(previous, current)).toBe(false);
    });
  });

  describe("edge comparison", () => {
    it("returns true when all edges are equal", () => {
      const previous = createStoreState();
      const current = createStoreState();
      expect(customEquality(previous, current)).toBe(true);
    });

    it("returns false when edge id changes", () => {
      const previous = createStoreState({ edges: [createEdge({ id: "e1" })] });
      const current = createStoreState({ edges: [createEdge({ id: "e2" })] });
      expect(customEquality(previous, current)).toBe(false);
    });

    it("returns false when edge source changes", () => {
      const previous = createStoreState({ edges: [createEdge({ source: "node1" })] });
      const current = createStoreState({ edges: [createEdge({ source: "node2" })] });
      expect(customEquality(previous, current)).toBe(false);
    });

    it("returns false when edge target changes", () => {
      const previous = createStoreState({ edges: [createEdge({ target: "node2" })] });
      const current = createStoreState({ edges: [createEdge({ target: "node3" })] });
      expect(customEquality(previous, current)).toBe(false);
    });
  });

  describe("workflow comparison", () => {
    it("returns false when workflow is different", () => {
      const previous = createStoreState({ workflow: { id: "wf1", name: "Test1" } });
      const current = createStoreState({ workflow: { id: "wf2", name: "Test2" } });
      expect(customEquality(previous, current)).toBe(false);
    });
  });
});
