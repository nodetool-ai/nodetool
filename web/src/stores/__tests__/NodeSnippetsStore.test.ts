/**
 * NodeSnippetsStore tests
 */

import { renderHook, act } from "@testing-library/react";
import useNodeSnippetsStore from "../NodeSnippetsStore";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "../NodeData";

describe("NodeSnippetsStore", () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    // Reset store state
    useNodeSnippetsStore.setState({ snippets: [] });
  });

  const createMockNode = (
    id: string,
    type: string,
    position: { x: number; y: number }
  ): Node<NodeData> => ({
    id,
    type,
    position,
    data: {
      properties: { test: "value" },
      selectable: undefined,
      dynamic_properties: {},
      workflow_id: "test-workflow",
      title: "Test Node"
    }
  });

  const createMockEdge = (
    id: string,
    source: string,
    target: string
  ): Edge => ({
    id,
    source,
    target
  });

  describe("addSnippet", () => {
    it("should add a snippet with required fields", () => {
      const { result } = renderHook(() => useNodeSnippetsStore());

      const nodes = [createMockNode("node1", "TestNode", { x: 0, y: 0 })];
      const edges: Edge[] = [];

      act(() => {
        const snippetId = result.current.createSnippetFromNodes(
          "Test Snippet",
          "Test Description",
          nodes,
          edges
        );

        expect(snippetId).toMatch(/^snippet_[a-z0-9]+_[a-z0-9]+$/);
      });

      const snippets = result.current.getSnippets();
      expect(snippets).toHaveLength(1);
      expect(snippets[0].name).toBe("Test Snippet");
      expect(snippets[0].description).toBe("Test Description");
      expect(snippets[0].nodes).toHaveLength(1);
      expect(snippets[0].nodeCount).toBe(1);
    });

    it("should include edges that connect selected nodes", () => {
      const { result } = renderHook(() => useNodeSnippetsStore());

      const node1 = createMockNode("node1", "TestNode", { x: 0, y: 0 });
      const node2 = createMockNode("node2", "TestNode", { x: 100, y: 0 });
      const internalEdge = createMockEdge("edge1", "node1", "node2");
      const externalEdge = createMockEdge("edge2", "node1", "node3");

      act(() => {
        result.current.createSnippetFromNodes(
          "Test Snippet",
          "Description",
          [node1, node2],
          [internalEdge, externalEdge]
        );
      });

      const snippets = result.current.getSnippets();
      expect(snippets[0].edges).toHaveLength(1);
      expect(snippets[0].edges[0].source).not.toBe("node1");
      expect(snippets[0].edges[0].target).not.toBe("node2");
    });

    it("should enforce maximum snippet limit", () => {
      const { result } = renderHook(() => useNodeSnippetsStore());

      const nodes = [createMockNode("node1", "TestNode", { x: 0, y: 0 })];

      // Add more than MAX_SNIPPETS (50)
      act(() => {
        for (let i = 0; i < 55; i++) {
          result.current.createSnippetFromNodes(
            `Snippet ${i}`,
            `Description ${i}`,
            nodes,
            []
          );
        }
      });

      const snippets = result.current.getSnippets();
      expect(snippets.length).toBeLessThanOrEqual(50);
    });

    it("should sort snippets by updated time descending", () => {
      jest.useFakeTimers();
      const { result } = renderHook(() => useNodeSnippetsStore());

      const nodes = [createMockNode("node1", "TestNode", { x: 0, y: 0 })];

      act(() => {
        result.current.createSnippetFromNodes("First", "Desc1", nodes, []);
      });

      // Advance time to ensure different timestamp
      act(() => {
        jest.advanceTimersByTime(100);
        result.current.createSnippetFromNodes("Second", "Desc2", nodes, []);
      });

      const snippets = result.current.getSnippets();
      expect(snippets[0].name).toBe("Second");
      expect(snippets[1].name).toBe("First");
      jest.useRealTimers();
    });
  });

  describe("updateSnippet", () => {
    it("should update snippet name and description", () => {
      const { result } = renderHook(() => useNodeSnippetsStore());

      const nodes = [createMockNode("node1", "TestNode", { x: 0, y: 0 })];

      let snippetId = "";
      act(() => {
        snippetId = result.current.createSnippetFromNodes(
          "Original Name",
          "Original Description",
          nodes,
          []
        );

        result.current.updateSnippet(snippetId, {
          name: "Updated Name",
          description: "Updated Description"
        });
      });

      const snippets = result.current.getSnippets();
      expect(snippets[0].name).toBe("Updated Name");
      expect(snippets[0].description).toBe("Updated Description");
    });

    it("should update updatedAt timestamp on update", () => {
      jest.useFakeTimers();
      const { result } = renderHook(() => useNodeSnippetsStore());

      const nodes = [createMockNode("node1", "TestNode", { x: 0, y: 0 })];

      let snippetId = "";
      act(() => {
        snippetId = result.current.createSnippetFromNodes(
          "Snippet",
          "Description",
          nodes,
          []
        );
      });

      const originalUpdatedAt = result.current.getSnippet(snippetId)?.updatedAt ?? 0;

      // Advance time to ensure timestamp difference
      act(() => {
        jest.advanceTimersByTime(100);
        result.current.updateSnippet(snippetId, { name: "Updated" });
      });

      const updatedSnippet = result.current.getSnippet(snippetId);
      expect(updatedSnippet?.updatedAt).toBeGreaterThan(originalUpdatedAt);
      jest.useRealTimers();
    });
  });

  describe("deleteSnippet", () => {
    it("should delete a snippet by ID", () => {
      const { result } = renderHook(() => useNodeSnippetsStore());

      const nodes = [createMockNode("node1", "TestNode", { x: 0, y: 0 })];

      let snippetId = "";
      act(() => {
        snippetId = result.current.createSnippetFromNodes(
          "To Delete",
          "Description",
          nodes,
          []
        );
      });

      expect(result.current.getSnippets()).toHaveLength(1);

      act(() => {
        result.current.deleteSnippet(snippetId);
      });

      expect(result.current.getSnippets()).toHaveLength(0);
      expect(result.current.getSnippet(snippetId)).toBeUndefined();
    });
  });

  describe("getSnippet", () => {
    it("should return undefined for non-existent snippet", () => {
      const { result } = renderHook(() => useNodeSnippetsStore());

      const snippet = result.current.getSnippet("non-existent-id");
      expect(snippet).toBeUndefined();
    });

    it("should return the correct snippet", () => {
      const { result } = renderHook(() => useNodeSnippetsStore());

      const nodes = [createMockNode("node1", "TestNode", { x: 0, y: 0 })];

      let snippetId = "";
      act(() => {
        snippetId = result.current.createSnippetFromNodes(
          "Test",
          "Description",
          nodes,
          []
        );
      });

      const snippet = result.current.getSnippet(snippetId);
      expect(snippet).toBeDefined();
      expect(snippet?.name).toBe("Test");
    });
  });

  describe("getSnippetsByNodeType", () => {
    it("should return snippets containing the specified node type", () => {
      const { result } = renderHook(() => useNodeSnippetsStore());

      const nodes1 = [createMockNode("node1", "TypeA", { x: 0, y: 0 })];
      const nodes2 = [createMockNode("node2", "TypeB", { x: 0, y: 0 })];
      const nodes3 = [
        createMockNode("node3", "TypeA", { x: 0, y: 0 }),
        createMockNode("node4", "TypeC", { x: 100, y: 0 })
      ];

      act(() => {
        result.current.createSnippetFromNodes("Snippet A1", "Desc", nodes1, []);
        result.current.createSnippetFromNodes("Snippet B", "Desc", nodes2, []);
        result.current.createSnippetFromNodes("Snippet A2", "Desc", nodes3, []);
      });

      const typeASnippets = result.current.getSnippetsByNodeType("TypeA");
      expect(typeASnippets).toHaveLength(2);

      const typeBSnippets = result.current.getSnippetsByNodeType("TypeB");
      expect(typeBSnippets).toHaveLength(1);
    });

    it("should return empty array for non-existent node type", () => {
      const { result } = renderHook(() => useNodeSnippetsStore());

      const nodes = [createMockNode("node1", "TypeA", { x: 0, y: 0 })];

      act(() => {
        result.current.createSnippetFromNodes("Snippet", "Desc", nodes, []);
      });

      const snippets = result.current.getSnippetsByNodeType("NonExistent");
      expect(snippets).toHaveLength(0);
    });
  });

  describe("persistence", () => {
    it("should persist snippets to localStorage", () => {
      const { result: result1 } = renderHook(() => useNodeSnippetsStore());
      const nodes = [createMockNode("node1", "TestNode", { x: 0, y: 0 })];

      act(() => {
        result1.current.createSnippetFromNodes(
          "Persistent Snippet",
          "Description",
          nodes,
          []
        );
      });

      // Create a new hook instance (simulates page reload)
      const { result: result2 } = renderHook(() => useNodeSnippetsStore());
      const snippets = result2.current.getSnippets();

      expect(snippets).toHaveLength(1);
      expect(snippets[0].name).toBe("Persistent Snippet");
    });
  });

  describe("snippet data structure", () => {
    it("should preserve node properties in snippet", () => {
      const { result } = renderHook(() => useNodeSnippetsStore());

      const node: Node<NodeData> = createMockNode("node1", "TestNode", {
        x: 100,
        y: 200
      });
      (node.data.properties as { customProp: string; test: string }) = {
        customProp: "customValue",
        test: "value"
      };

      act(() => {
        result.current.createSnippetFromNodes("Snippet", "Desc", [node], []);
      });

      const snippet = result.current.getSnippets()[0];
      expect(snippet.nodes[0].data.properties).toEqual({
        customProp: "customValue",
        test: "value"
      });
      expect(snippet.nodes[0].position).toEqual({ x: 100, y: 200 });
      expect(snippet.nodes[0].type).toBe("TestNode");
    });

    it("should clear workflow_id from snippet nodes", () => {
      const { result } = renderHook(() => useNodeSnippetsStore());

      const node: Node<NodeData> = createMockNode("node1", "TestNode", {
        x: 0,
        y: 0
      });
      node.data.workflow_id = "original-workflow-id";

      act(() => {
        result.current.createSnippetFromNodes("Snippet", "Desc", [node], []);
      });

      const snippet = result.current.getSnippets()[0];
      expect(snippet.nodes[0].data.workflow_id).toBe("");
    });

    it("should generate unique IDs for snippet nodes", () => {
      const { result } = renderHook(() => useNodeSnippetsStore());

      const node1 = createMockNode("node1", "TestNode", { x: 0, y: 0 });
      const node2 = createMockNode("node2", "TestNode", { x: 100, y: 0 });

      act(() => {
        result.current.createSnippetFromNodes("Snippet", "Desc", [node1, node2], []);
      });

      const snippet = result.current.getSnippets()[0];
      expect(snippet.nodes[0].id).not.toBe("node1");
      expect(snippet.nodes[0].id).toMatch(/^node_node1$/);
      expect(snippet.nodes[1].id).toMatch(/^node_node2$/);
    });
  });
});
