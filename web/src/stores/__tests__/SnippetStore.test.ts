import { createSnippetFromSelection, convertNodesToSnippetNodes, convertEdgesToSnippetEdges } from "../SnippetStore";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "../NodeData";

describe("SnippetStore utilities", () => {
  const createTestNode = (id: string, type: string): Node<NodeData> => ({
    id,
    type,
    position: { x: 100, y: 200 },
    data: {
      properties: {},
      selectable: true,
      dynamic_properties: {},
      workflow_id: "test"
    }
  });

  describe("convertNodesToSnippetNodes", () => {
    it("converts ReactFlow nodes to snippet nodes", () => {
      const nodes: Node<NodeData>[] = [createTestNode("node1", "textInput")];

      const snippetNodes = convertNodesToSnippetNodes(nodes);

      expect(snippetNodes).toHaveLength(1);
      expect(snippetNodes[0]).toEqual({
        id: "node1",
        type: "textInput",
        position: { x: 100, y: 200 },
        data: {
          properties: {},
          selectable: true,
          dynamic_properties: {},
          workflow_id: "test"
        },
        width: undefined,
        height: undefined,
        selected: undefined
      });
    });

    it("handles nodes with undefined type", () => {
      const nodes: Node<NodeData>[] = [{
        id: "node1",
        type: undefined,
        position: { x: 0, y: 0 },
        data: {
          properties: {},
          selectable: true,
          dynamic_properties: {},
          workflow_id: "test"
        }
      }];

      const snippetNodes = convertNodesToSnippetNodes(nodes);

      expect(snippetNodes[0].type).toBe("unknown");
    });
  });

  describe("convertEdgesToSnippetEdges", () => {
    it("converts ReactFlow edges to snippet edges", () => {
      const edges: Edge[] = [
        {
          id: "edge1",
          source: "node1",
          target: "node2",
          sourceHandle: "output",
          targetHandle: "input",
          type: "default"
        }
      ];

      const snippetEdges = convertEdgesToSnippetEdges(edges);

      expect(snippetEdges).toHaveLength(1);
      expect(snippetEdges[0]).toEqual({
        id: "edge1",
        source: "node1",
        target: "node2",
        sourceHandle: "output",
        targetHandle: "input",
        type: "default"
      });
    });

    it("handles null handles by converting to undefined", () => {
      const edges: Edge[] = [
        {
          id: "edge1",
          source: "node1",
          target: "node2",
          sourceHandle: null,
          targetHandle: null
        }
      ];

      const snippetEdges = convertEdgesToSnippetEdges(edges);

      expect(snippetEdges[0].sourceHandle).toBeUndefined();
      expect(snippetEdges[0].targetHandle).toBeUndefined();
    });
  });

  describe("createSnippetFromSelection", () => {
    it("creates snippet data from nodes and edges", () => {
      const nodes: Node<NodeData>[] = [
        createTestNode("node1", "textInput"),
        createTestNode("node2", "llm")
      ];

      const edges: Edge[] = [
        {
          id: "edge1",
          source: "node1",
          target: "node2"
        }
      ];

      const snippet = createSnippetFromSelection(
        "Test Snippet",
        "A test snippet",
        nodes,
        edges
      );

      expect(snippet.name).toBe("Test Snippet");
      expect(snippet.description).toBe("A test snippet");
      expect(snippet.nodes).toHaveLength(2);
      expect(snippet.edges).toHaveLength(1);
      expect(snippet).not.toHaveProperty("createdAt");
      expect(snippet).not.toHaveProperty("updatedAt");
      expect(snippet).not.toHaveProperty("usageCount");
    });
  });
});
