import { Edge, Node } from "@xyflow/react";

import { NodeMetadata } from "../../../stores/ApiTypes";
import { NodeData } from "../../../stores/NodeData";
import { isValidEdge, sanitizeGraph } from "../graphMapping";
import { CONTROL_HANDLE_ID } from "../../../stores/graphEdgeToReactFlowEdge";

const baseMetadata: NodeMetadata = {
  title: "Test Node",
  description: "Test node",
  namespace: "test",
  node_type: "test.node",
  layout: "default",
  properties: [
    {
      name: "input",
      type: {
        type: "string",
        optional: true,
        values: null,
        type_args: [],
        type_name: null
      },
      description: "input",
      required: false
    }
  ],
  outputs: [
    {
      name: "output",
      type: {
        type: "string",
        optional: false,
        values: null,
        type_args: [],
        type_name: null
      },
      stream: false
    }
  ],
  recommended_models: [],
  supports_dynamic_inputs: false,
  is_streaming_output: false,
  supports_dynamic_outputs: false,
  required_settings: []
} as NodeMetadata;

const makeNode = (id: string, type = "test"): Node<NodeData> => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data: {
    workflow_id: "wf",
    properties: {},
    dynamic_properties: {},
    selectable: true
  }
});

const makeEdge = (
  id: string,
  source: string,
  target: string,
  sourceHandle = "output",
  targetHandle = "input"
): Edge => ({
  id,
  source,
  target,
  sourceHandle,
  targetHandle
});

describe("graphMapping helpers", () => {
  it("rejects edges that point to missing nodes", () => {
    const node = makeNode("a");
    const edge = makeEdge("e1", "a", "missing");

    const valid = isValidEdge(edge, new Map([["a", node]]), {
      test: baseMetadata
    });

    expect(valid).toBe(false);
  });

  it("strips edges with invalid handles during sanitation", () => {
    const nodes = [makeNode("a"), makeNode("b")];
    const edges = [makeEdge("e1", "a", "b", "invalid", "input")];

    const { edges: sanitized } = sanitizeGraph(nodes, edges, {
      test: baseMetadata
    });

    expect(sanitized).toHaveLength(0);
  });

  it("keeps valid edges intact during sanitation", () => {
    const nodes = [makeNode("a"), makeNode("b")];
    const edges = [makeEdge("e1", "a", "b")];

    const { edges: sanitized } = sanitizeGraph(nodes, edges, {
      test: baseMetadata
    });

    expect(sanitized).toHaveLength(1);
    expect(sanitized[0].id).toBe("e1");
  });

  describe("dynamic handle auto-add", () => {
    const dynamicMeta: NodeMetadata = {
      ...baseMetadata,
      node_type: "test.dynamic",
      supports_dynamic_inputs: true
    } as NodeMetadata;

    const dynamicOutputsMeta: NodeMetadata = {
      ...baseMetadata,
      node_type: "test.dynamicOutputs",
      supports_dynamic_outputs: true
    } as NodeMetadata;

    it("adds missing dynamic_properties entry for edges to supports_dynamic_inputs target", () => {
      const nodes = [
        makeNode("a", "test"),
        makeNode("b", "test.dynamic")
      ];
      const edges = [makeEdge("e1", "a", "b", "output", "new_field")];

      const { nodes: sanitizedNodes, edges: sanitizedEdges } = sanitizeGraph(
        nodes,
        edges,
        { test: baseMetadata, "test.dynamic": dynamicMeta }
      );

      const target = sanitizedNodes.find((n) => n.id === "b");
      expect(target?.data.dynamic_properties).toEqual({ new_field: "" });
      expect(sanitizedEdges).toHaveLength(1);
    });

    it("does not overwrite an existing dynamic_properties entry", () => {
      const target = makeNode("b", "test.dynamic");
      target.data.dynamic_properties = { existing: "value" };
      const nodes = [makeNode("a", "test"), target];
      const edges = [makeEdge("e1", "a", "b", "output", "existing")];

      const { nodes: sanitizedNodes } = sanitizeGraph(nodes, edges, {
        test: baseMetadata,
        "test.dynamic": dynamicMeta
      });

      const sanitizedTarget = sanitizedNodes.find((n) => n.id === "b");
      expect(sanitizedTarget?.data.dynamic_properties).toEqual({
        existing: "value"
      });
    });

    it("adds missing dynamic_outputs entry for edges from supports_dynamic_outputs source", () => {
      const nodes = [
        makeNode("a", "test.dynamicOutputs"),
        makeNode("b", "test")
      ];
      const edges = [makeEdge("e1", "a", "b", "new_out", "input")];

      const { nodes: sanitizedNodes, edges: sanitizedEdges } = sanitizeGraph(
        nodes,
        edges,
        {
          "test.dynamicOutputs": dynamicOutputsMeta,
          test: baseMetadata
        }
      );

      const source = sanitizedNodes.find((n) => n.id === "a");
      expect(source?.data.dynamic_outputs).toMatchObject({
        new_out: { type: "any" }
      });
      expect(sanitizedEdges).toHaveLength(1);
    });

    it("does not auto-add dynamic_properties for non-dynamic target nodes", () => {
      const nodes = [makeNode("a", "test"), makeNode("b", "test")];
      const edges = [makeEdge("e1", "a", "b", "output", "ghost")];

      const { nodes: sanitizedNodes, edges: sanitizedEdges } = sanitizeGraph(
        nodes,
        edges,
        { test: baseMetadata }
      );

      const target = sanitizedNodes.find((n) => n.id === "b");
      expect(target?.data.dynamic_properties).toEqual({});
      expect(sanitizedEdges).toHaveLength(0);
    });

    it("keeps edges to existing dynamic_properties on non-dynamic target nodes (Agent template inputs)", () => {
      const target = makeNode("b", "test");
      target.data.dynamic_properties = { brief: "" };
      const nodes = [makeNode("a", "test"), target];
      const edges = [makeEdge("e1", "a", "b", "output", "brief")];

      const { edges: sanitizedEdges } = sanitizeGraph(nodes, edges, {
        test: baseMetadata
      });

      expect(sanitizedEdges).toHaveLength(1);
    });
  });

  describe("exposedInputs auto-promotion", () => {
    it("promotes static target property to exposedInputs when not inline or input_field", () => {
      const nodes = [makeNode("a", "test"), makeNode("b", "test")];
      const edges = [makeEdge("e1", "a", "b", "output", "input")];

      const { nodes: sanitizedNodes, edges: sanitizedEdges } = sanitizeGraph(
        nodes,
        edges,
        { test: baseMetadata }
      );

      const target = sanitizedNodes.find((n) => n.id === "b");
      expect(target?.data.exposedInputs).toEqual(["input"]);
      expect(sanitizedEdges).toHaveLength(1);
    });

    it("does not promote when property is already in input_fields", () => {
      const meta = { ...baseMetadata, input_fields: ["input"] } as NodeMetadata;
      const nodes = [makeNode("a", "test"), makeNode("b", "test")];
      const edges = [makeEdge("e1", "a", "b", "output", "input")];

      const { nodes: sanitizedNodes } = sanitizeGraph(nodes, edges, {
        test: meta
      });

      const target = sanitizedNodes.find((n) => n.id === "b");
      expect(target?.data.exposedInputs).toBeUndefined();
    });

    it("does not promote when property is in inline_fields", () => {
      const meta = {
        ...baseMetadata,
        inline_fields: ["input"]
      } as NodeMetadata;
      const nodes = [makeNode("a", "test"), makeNode("b", "test")];
      const edges = [makeEdge("e1", "a", "b", "output", "input")];

      const { nodes: sanitizedNodes } = sanitizeGraph(nodes, edges, {
        test: meta
      });

      const target = sanitizedNodes.find((n) => n.id === "b");
      expect(target?.data.exposedInputs).toBeUndefined();
    });

    it("does not duplicate an already-exposed property", () => {
      const target = makeNode("b", "test");
      target.data.exposedInputs = ["input"];
      const nodes = [makeNode("a", "test"), target];
      const edges = [makeEdge("e1", "a", "b", "output", "input")];

      const { nodes: sanitizedNodes } = sanitizeGraph(nodes, edges, {
        test: baseMetadata
      });

      const sanitizedTarget = sanitizedNodes.find((n) => n.id === "b");
      expect(sanitizedTarget?.data.exposedInputs).toEqual(["input"]);
    });
  });

  describe("control edges", () => {
    it("accepts control edges with __control__ target handle", () => {
      const agentNode = makeNode("agent1", "nodetool.agents.Agent");
      const targetNode = makeNode("target1", "test");
      const edge = makeEdge("ce1", "agent1", "target1", "output", CONTROL_HANDLE_ID);

      const nodeMap = new Map([
        ["agent1", agentNode],
        ["target1", targetNode]
      ]);

      const valid = isValidEdge(edge, nodeMap, {
        "nodetool.agents.Agent": baseMetadata,
        test: baseMetadata
      });

      expect(valid).toBe(true);
    });

    it("preserves control edges during sanitation", () => {
      const nodes = [
        makeNode("agent1", "nodetool.agents.Agent"),
        makeNode("target1", "test")
      ];
      const edges = [
        makeEdge("ce1", "agent1", "target1", "output", CONTROL_HANDLE_ID)
      ];

      const { edges: sanitized } = sanitizeGraph(nodes, edges, {
        "nodetool.agents.Agent": baseMetadata,
        test: baseMetadata
      });

      expect(sanitized).toHaveLength(1);
      expect(sanitized[0].id).toBe("ce1");
    });
  });
});
