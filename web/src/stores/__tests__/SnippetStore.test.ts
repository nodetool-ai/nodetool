import { Snippet } from "../SnippetTypes";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "../NodeData";

describe("createSnippetFromSelection", () => {
  it("should create a snippet from selected nodes and edges", () => {
    const { createSnippetFromSelection } = require("../SnippetStore");

    const nodes: Node<NodeData>[] = [
      {
        id: "node-1",
        type: "input",
        position: { x: 100, y: 200 },
        data: {
          properties: { value: "test" },
          selectable: true,
          dynamic_properties: {},
          workflow_id: "workflow-1"
        },
        selected: true
      },
      {
        id: "node-2",
        type: "output",
        position: { x: 300, y: 200 },
        data: {
          properties: {},
          selectable: true,
          dynamic_properties: {},
          workflow_id: "workflow-1"
        },
        selected: true
      }
    ];

    const edges: Edge[] = [
      {
        id: "edge-1",
        source: "node-1",
        target: "node-2",
        sourceHandle: "output",
        targetHandle: "input",
        selected: true
      }
    ];

    const snippet = createSnippetFromSelection("My Snippet", "Description", nodes, edges);

    expect(snippet.name).toBe("My Snippet");
    expect(snippet.description).toBe("Description");
    expect(snippet.nodes).toHaveLength(2);
    expect(snippet.edges).toHaveLength(1);
    expect(snippet.nodes[0].id).toBe("node-1");
    expect(snippet.nodes[1].id).toBe("node-2");
    expect(snippet.edges[0].source).toBe("node-1");
    expect(snippet.edges[0].target).toBe("node-2");
    expect(snippet.usageCount).toBe(0);
    expect(snippet.id).toBeDefined();
    expect(snippet.createdAt).toBeDefined();
    expect(snippet.updatedAt).toBeDefined();
  });
});

describe("applySnippetToGraph", () => {
  const createMockNode = (id: string): Node<NodeData> => ({
    id,
    type: "test",
    position: { x: 100, y: 100 },
    data: {
      properties: {},
      selectable: true,
      dynamic_properties: {},
      workflow_id: "workflow-1"
    }
  });

  it("should apply snippet nodes and edges to graph", () => {
    const { applySnippetToGraph } = require("../SnippetStore");

    const snippet: Snippet = {
      id: "snippet-1",
      name: "Test",
      nodes: [
        { id: "s1", type: "input", position: { x: 0, y: 0 }, data: {} as NodeData },
        { id: "s2", type: "output", position: { x: 200, y: 0 }, data: {} as NodeData }
      ],
      edges: [
        { id: "se1", source: "s1", target: "s2", sourceHandle: null, targetHandle: null }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      usageCount: 0
    };

    const existingNodes = [createMockNode("existing-1")];
    const existingEdges: Edge[] = [];
    const generateNodeId = () => `new-${Date.now()}`;

    const result = applySnippetToGraph(snippet, existingNodes, existingEdges, generateNodeId, {
      x: 500,
      y: 300
    });

    expect(result.newNodes).toHaveLength(2);
    expect(result.newEdges).toHaveLength(1);
    expect(result.newNodes[0].id).not.toBe("s1");
    expect(result.newNodes[1].id).not.toBe("s2");
    expect(result.newNodes[0].position.x).toBe(500);
    expect(result.newNodes[0].position.y).toBe(300);
    expect(result.newNodes[1].position.x).toBe(700);
    expect(result.newNodes[1].position.y).toBe(300);
    expect(result.newEdges[0].source).toBe(result.newNodes[0].id);
    expect(result.newEdges[0].target).toBe(result.newNodes[1].id);
  });

  it("should only include edges where both source and target are in the snippet", () => {
    const { applySnippetToGraph } = require("../SnippetStore");

    const snippet: Snippet = {
      id: "snippet-1",
      name: "Test",
      nodes: [{ id: "s1", type: "input", position: { x: 0, y: 0 }, data: {} as NodeData }],
      edges: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      usageCount: 0
    };

    const existingNodes: Node<NodeData>[] = [];
    const existingEdges: Edge[] = [];
    const generateNodeId = () => `new-${Date.now()}`;

    const result = applySnippetToGraph(snippet, existingNodes, existingEdges, generateNodeId);

    expect(result.newNodes).toHaveLength(1);
    expect(result.newEdges).toHaveLength(0);
  });
});
