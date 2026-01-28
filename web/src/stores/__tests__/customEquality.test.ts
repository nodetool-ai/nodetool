import { customEquality } from "../customEquality";
import { PartializedNodeStore } from "../NodeStore";
import { Edge, Node, Position } from "@xyflow/react";
import { NodeData } from "../NodeData";

const createMockNode = (
  id: string,
  overrides: Partial<Node<NodeData>> = {}
): Node<NodeData> => ({
  id,
  type: "test",
  position: { x: 0, y: 0 },
  targetPosition: Position.Left,
  sourcePosition: Position.Right,
  selected: false,
  dragging: false,
  data: {
    properties: {},
    dynamic_properties: {},
    selectable: true,
    workflow_id: "workflow-1",
    collapsed: false,
    bypassed: false
  },
  ...overrides
});

const createMockEdge = (
  id: string,
  source: string,
  target: string,
  overrides: Partial<Edge> = {}
): Edge => ({
  id,
  source,
  target,
  sourceHandle: null,
  targetHandle: null,
  type: "default",
  selected: false,
  ...overrides
});

const createMockWorkflow = (id: string, name: string) => ({
  id,
  name,
  access: "private",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  description: "",
  tags: [],
  thumbnail: null,
  graph: { nodes: [], edges: [] },
  input_schema: null,
  output_schema: null,
  is_public: false,
  tool_name: null,
  required_models: null,
  metadata: {}
});

describe("customEquality", () => {
  describe("edge cases", () => {
    it("should return false when previous is undefined", () => {
      const current: PartializedNodeStore = {
        workflow: createMockWorkflow("wf-1", "Test Workflow"),
        nodes: [createMockNode("node-1")],
        edges: [createMockEdge("edge-1", "node-1", "node-2")]
      };
      expect(customEquality(undefined, current)).toBe(false);
    });

    it("should return false when current is undefined", () => {
      const previous: PartializedNodeStore = {
        workflow: createMockWorkflow("wf-1", "Test Workflow"),
        nodes: [createMockNode("node-1")],
        edges: [createMockEdge("edge-1", "node-1", "node-2")]
      };
      expect(customEquality(previous, undefined)).toBe(false);
    });

    it("should return false when both are undefined", () => {
      expect(customEquality(undefined, undefined)).toBe(false);
    });

    it("should return false when previous.nodes is undefined", () => {
      const workflow = createMockWorkflow("wf-1", "Test Workflow");
      const current: PartializedNodeStore = {
        workflow,
        nodes: [createMockNode("node-1")],
        edges: [createMockEdge("edge-1", "node-1", "node-2")]
      };
      const previous: PartializedNodeStore = {
        workflow,
        nodes: undefined as any,
        edges: [createMockEdge("edge-1", "node-1", "node-2")]
      };
      expect(customEquality(previous, current)).toBe(false);
    });

    it("should return false when current.nodes is undefined", () => {
      const workflow = createMockWorkflow("wf-1", "Test Workflow");
      const previous: PartializedNodeStore = {
        workflow,
        nodes: [createMockNode("node-1")],
        edges: [createMockEdge("edge-1", "node-1", "node-2")]
      };
      const current: PartializedNodeStore = {
        workflow,
        nodes: undefined as any,
        edges: [createMockEdge("edge-1", "node-1", "node-2")]
      };
      expect(customEquality(previous, current)).toBe(false);
    });

    it("should return false when previous.edges is undefined", () => {
      const workflow = createMockWorkflow("wf-1", "Test Workflow");
      const current: PartializedNodeStore = {
        workflow,
        nodes: [createMockNode("node-1")],
        edges: [createMockEdge("edge-1", "node-1", "node-2")]
      };
      const previous: PartializedNodeStore = {
        workflow,
        nodes: [createMockNode("node-1")],
        edges: undefined as any
      };
      expect(customEquality(previous, current)).toBe(false);
    });

    it("should return false when current.edges is undefined", () => {
      const workflow = createMockWorkflow("wf-1", "Test Workflow");
      const previous: PartializedNodeStore = {
        workflow,
        nodes: [createMockNode("node-1")],
        edges: [createMockEdge("edge-1", "node-1", "node-2")]
      };
      const current: PartializedNodeStore = {
        workflow,
        nodes: [createMockNode("node-1")],
        edges: undefined as any
      };
      expect(customEquality(previous, current)).toBe(false);
    });
  });

  describe("node length comparison", () => {
    it("should return false when node arrays have different lengths", () => {
      const workflow = createMockWorkflow("wf-1", "Test Workflow");
      const previous: PartializedNodeStore = {
        workflow,
        nodes: [createMockNode("node-1")],
        edges: [createMockEdge("edge-1", "node-1", "node-2")]
      };
      const current: PartializedNodeStore = {
        workflow,
        nodes: [
          createMockNode("node-1"),
          createMockNode("node-2")
        ],
        edges: [createMockEdge("edge-1", "node-1", "node-2")]
      };
      expect(customEquality(previous, current)).toBe(false);
    });

    it("should return false when one node array is empty and other is not", () => {
      const workflow = createMockWorkflow("wf-1", "Test Workflow");
      const previous: PartializedNodeStore = {
        workflow,
        nodes: [],
        edges: []
      };
      const current: PartializedNodeStore = {
        workflow,
        nodes: [createMockNode("node-1")],
        edges: []
      };
      expect(customEquality(previous, current)).toBe(false);
    });

    it("should return true when both node arrays are empty", () => {
      const workflow = createMockWorkflow("wf-1", "Test Workflow");
      const previous: PartializedNodeStore = {
        workflow,
        nodes: [],
        edges: []
      };
      const current: PartializedNodeStore = {
        workflow,
        nodes: [],
        edges: []
      };
      expect(customEquality(previous, current)).toBe(true);
    });
  });

  describe("edge length comparison", () => {
    it("should return false when edge arrays have different lengths", () => {
      const workflow = createMockWorkflow("wf-1", "Test Workflow");
      const previous: PartializedNodeStore = {
        workflow,
        nodes: [createMockNode("node-1")],
        edges: [createMockEdge("edge-1", "node-1", "node-2")]
      };
      const current: PartializedNodeStore = {
        workflow,
        nodes: [createMockNode("node-1")],
        edges: [
          createMockEdge("edge-1", "node-1", "node-2"),
          createMockEdge("edge-2", "node-2", "node-3")
        ]
      };
      expect(customEquality(previous, current)).toBe(false);
    });

    it("should return true when both edge arrays are empty", () => {
      const workflow = createMockWorkflow("wf-1", "Test Workflow");
      const previous: PartializedNodeStore = {
        workflow,
        nodes: [createMockNode("node-1")],
        edges: []
      };
      const current: PartializedNodeStore = {
        workflow,
        nodes: [createMockNode("node-1")],
        edges: []
      };
      expect(customEquality(previous, current)).toBe(true);
    });
  });

  describe("node comparison", () => {
    it("should return true for identical nodes", () => {
      const workflow = createMockWorkflow("wf-1", "Test Workflow");
      const previous: PartializedNodeStore = {
        workflow,
        nodes: [createMockNode("node-1", { type: "test" })],
        edges: []
      };
      const current: PartializedNodeStore = {
        workflow,
        nodes: [createMockNode("node-1", { type: "test" })],
        edges: []
      };
      expect(customEquality(previous, current)).toBe(true);
    });

    it("should return false when node id changes", () => {
      const workflow = createMockWorkflow("wf-1", "Test Workflow");
      const previous: PartializedNodeStore = {
        workflow,
        nodes: [createMockNode("node-1")],
        edges: []
      };
      const current: PartializedNodeStore = {
        workflow,
        nodes: [createMockNode("node-2")],
        edges: []
      };
      expect(customEquality(previous, current)).toBe(false);
    });

    it("should return false when node type changes", () => {
      const workflow = createMockWorkflow("wf-1", "Test Workflow");
      const previous: PartializedNodeStore = {
        workflow,
        nodes: [createMockNode("node-1", { type: "type-a" })],
        edges: []
      };
      const current: PartializedNodeStore = {
        workflow,
        nodes: [createMockNode("node-1", { type: "type-b" })],
        edges: []
      };
      expect(customEquality(previous, current)).toBe(false);
    });

    it("should return false when node position changes", () => {
      const workflow = createMockWorkflow("wf-1", "Test Workflow");
      const previous: PartializedNodeStore = {
        workflow,
        nodes: [createMockNode("node-1", { position: { x: 0, y: 0 } })],
        edges: []
      };
      const current: PartializedNodeStore = {
        workflow,
        nodes: [createMockNode("node-1", { position: { x: 100, y: 100 } })],
        edges: []
      };
      expect(customEquality(previous, current)).toBe(false);
    });

    it("should return false when node collapsed state changes", () => {
      const workflow = createMockWorkflow("wf-1", "Test Workflow");
      const previous: PartializedNodeStore = {
        workflow,
        nodes: [createMockNode("node-1", { data: { properties: {}, dynamic_properties: {}, selectable: true, workflow_id: "workflow-1", collapsed: false, bypassed: false } })],
        edges: []
      };
      const current: PartializedNodeStore = {
        workflow,
        nodes: [createMockNode("node-1", { data: { properties: {}, dynamic_properties: {}, selectable: true, workflow_id: "workflow-1", collapsed: true, bypassed: false } })],
        edges: []
      };
      expect(customEquality(previous, current)).toBe(false);
    });

    it("should return false when node bypassed state changes", () => {
      const workflow = createMockWorkflow("wf-1", "Test Workflow");
      const previous: PartializedNodeStore = {
        workflow,
        nodes: [createMockNode("node-1", { data: { properties: {}, dynamic_properties: {}, selectable: true, workflow_id: "workflow-1", collapsed: false, bypassed: false } })],
        edges: []
      };
      const current: PartializedNodeStore = {
        workflow,
        nodes: [createMockNode("node-1", { data: { properties: {}, dynamic_properties: {}, selectable: true, workflow_id: "workflow-1", collapsed: false, bypassed: true } })],
        edges: []
      };
      expect(customEquality(previous, current)).toBe(false);
    });

    it("should return false when node properties change", () => {
      const workflow = createMockWorkflow("wf-1", "Test Workflow");
      const previous: PartializedNodeStore = {
        workflow,
        nodes: [createMockNode("node-1", { data: { properties: { prop1: "value1" }, dynamic_properties: {}, selectable: true, workflow_id: "workflow-1", collapsed: false, bypassed: false } })],
        edges: []
      };
      const current: PartializedNodeStore = {
        workflow,
        nodes: [createMockNode("node-1", { data: { properties: { prop1: "value2" }, dynamic_properties: {}, selectable: true, workflow_id: "workflow-1", collapsed: false, bypassed: false } })],
        edges: []
      };
      expect(customEquality(previous, current)).toBe(false);
    });

    it("should return true when node properties are shallow equal", () => {
      const workflow = createMockWorkflow("wf-1", "Test Workflow");
      const previous: PartializedNodeStore = {
        workflow,
        nodes: [createMockNode("node-1", { data: { properties: { prop1: "value1", prop2: "value2" }, dynamic_properties: {}, selectable: true, workflow_id: "workflow-1", collapsed: false, bypassed: false } })],
        edges: []
      };
      const current: PartializedNodeStore = {
        workflow,
        nodes: [createMockNode("node-1", { data: { properties: { prop1: "value1", prop2: "value2" }, dynamic_properties: {}, selectable: true, workflow_id: "workflow-1", collapsed: false, bypassed: false } })],
        edges: []
      };
      expect(customEquality(previous, current)).toBe(true);
    });
  });

  describe("edge comparison", () => {
    it("should return true for identical edges", () => {
      const workflow = createMockWorkflow("wf-1", "Test Workflow");
      const previous: PartializedNodeStore = {
        workflow,
        nodes: [createMockNode("node-1"), createMockNode("node-2")],
        edges: [createMockEdge("edge-1", "node-1", "node-2")]
      };
      const current: PartializedNodeStore = {
        workflow,
        nodes: [createMockNode("node-1"), createMockNode("node-2")],
        edges: [createMockEdge("edge-1", "node-1", "node-2")]
      };
      expect(customEquality(previous, current)).toBe(true);
    });

    it("should return false when edge id changes", () => {
      const workflow = createMockWorkflow("wf-1", "Test Workflow");
      const previous: PartializedNodeStore = {
        workflow,
        nodes: [createMockNode("node-1"), createMockNode("node-2")],
        edges: [createMockEdge("edge-1", "node-1", "node-2")]
      };
      const current: PartializedNodeStore = {
        workflow,
        nodes: [createMockNode("node-1"), createMockNode("node-2")],
        edges: [createMockEdge("edge-2", "node-1", "node-2")]
      };
      expect(customEquality(previous, current)).toBe(false);
    });

    it("should return false when edge source changes", () => {
      const workflow = createMockWorkflow("wf-1", "Test Workflow");
      const previous: PartializedNodeStore = {
        workflow,
        nodes: [createMockNode("node-1"), createMockNode("node-2")],
        edges: [createMockEdge("edge-1", "node-1", "node-2")]
      };
      const current: PartializedNodeStore = {
        workflow,
        nodes: [createMockNode("node-1"), createMockNode("node-2")],
        edges: [createMockEdge("edge-1", "node-2", "node-2")]
      };
      expect(customEquality(previous, current)).toBe(false);
    });

    it("should return false when edge target changes", () => {
      const workflow = createMockWorkflow("wf-1", "Test Workflow");
      const previous: PartializedNodeStore = {
        workflow,
        nodes: [createMockNode("node-1"), createMockNode("node-2")],
        edges: [createMockEdge("edge-1", "node-1", "node-2")]
      };
      const current: PartializedNodeStore = {
        workflow,
        nodes: [createMockNode("node-1"), createMockNode("node-2")],
        edges: [createMockEdge("edge-1", "node-1", "node-1")]
      };
      expect(customEquality(previous, current)).toBe(false);
    });

    it("should return false when edge sourceHandle changes", () => {
      const workflow = createMockWorkflow("wf-1", "Test Workflow");
      const previous: PartializedNodeStore = {
        workflow,
        nodes: [createMockNode("node-1")],
        edges: [createMockEdge("edge-1", "node-1", "node-2", { sourceHandle: "handle-1" })]
      };
      const current: PartializedNodeStore = {
        workflow,
        nodes: [createMockNode("node-1")],
        edges: [createMockEdge("edge-1", "node-1", "node-2", { sourceHandle: "handle-2" })]
      };
      expect(customEquality(previous, current)).toBe(false);
    });

    it("should return false when edge targetHandle changes", () => {
      const workflow = createMockWorkflow("wf-1", "Test Workflow");
      const previous: PartializedNodeStore = {
        workflow,
        nodes: [createMockNode("node-1")],
        edges: [createMockEdge("edge-1", "node-1", "node-2", { targetHandle: "handle-1" })]
      };
      const current: PartializedNodeStore = {
        workflow,
        nodes: [createMockNode("node-1")],
        edges: [createMockEdge("edge-1", "node-1", "node-2", { targetHandle: "handle-2" })]
      };
      expect(customEquality(previous, current)).toBe(false);
    });
  });

  describe("workflow comparison", () => {
    it("should return true when workflow is the same reference", () => {
      const workflow = createMockWorkflow("wf-1", "Workflow 1");
      const previous: PartializedNodeStore = {
        workflow,
        nodes: [createMockNode("node-1")],
        edges: []
      };
      const current: PartializedNodeStore = {
        workflow,
        nodes: [createMockNode("node-1")],
        edges: []
      };
      expect(customEquality(previous, current)).toBe(true);
    });

    it("should return false when workflow name changes", () => {
      const workflow1 = createMockWorkflow("wf-1", "Workflow 1");
      const workflow2 = createMockWorkflow("wf-1", "Workflow 2");
      const previous: PartializedNodeStore = {
        workflow: workflow1,
        nodes: [createMockNode("node-1")],
        edges: []
      };
      const current: PartializedNodeStore = {
        workflow: workflow2,
        nodes: [createMockNode("node-1")],
        edges: []
      };
      expect(customEquality(previous, current)).toBe(false);
    });
  });

  describe("multiple nodes and edges", () => {
    it("should return true for multiple identical nodes and edges", () => {
      const workflow = createMockWorkflow("wf-1", "Test Workflow");
      const previous: PartializedNodeStore = {
        workflow,
        nodes: [
          createMockNode("node-1"),
          createMockNode("node-2"),
          createMockNode("node-3")
        ],
        edges: [
          createMockEdge("edge-1", "node-1", "node-2"),
          createMockEdge("edge-2", "node-2", "node-3")
        ]
      };
      const current: PartializedNodeStore = {
        workflow,
        nodes: [
          createMockNode("node-1"),
          createMockNode("node-2"),
          createMockNode("node-3")
        ],
        edges: [
          createMockEdge("edge-1", "node-1", "node-2"),
          createMockEdge("edge-2", "node-2", "node-3")
        ]
      };
      expect(customEquality(previous, current)).toBe(true);
    });

    it("should return false when one node in array changes", () => {
      const workflow = createMockWorkflow("wf-1", "Test Workflow");
      const previous: PartializedNodeStore = {
        workflow,
        nodes: [
          createMockNode("node-1"),
          createMockNode("node-2", { position: { x: 0, y: 0 } }),
          createMockNode("node-3")
        ],
        edges: []
      };
      const current: PartializedNodeStore = {
        workflow,
        nodes: [
          createMockNode("node-1"),
          createMockNode("node-2", { position: { x: 100, y: 100 } }),
          createMockNode("node-3")
        ],
        edges: []
      };
      expect(customEquality(previous, current)).toBe(false);
    });

    it("should return false when one edge in array changes", () => {
      const workflow = createMockWorkflow("wf-1", "Test Workflow");
      const previous: PartializedNodeStore = {
        workflow,
        nodes: [createMockNode("node-1"), createMockNode("node-2"), createMockNode("node-3")],
        edges: [
          createMockEdge("edge-1", "node-1", "node-2"),
          createMockEdge("edge-2", "node-2", "node-3")
        ]
      };
      const current: PartializedNodeStore = {
        workflow,
        nodes: [createMockNode("node-1"), createMockNode("node-2"), createMockNode("node-3")],
        edges: [
          createMockEdge("edge-1", "node-1", "node-2"),
          createMockEdge("edge-2", "node-2", "node-1")
        ]
      };
      expect(customEquality(previous, current)).toBe(false);
    });
  });
});
