/**
 * useNodeSnippets hook tests
 */

import { renderHook } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { useNodeSnippets } from "../useNodeSnippets";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import useNodeSnippetsStore from "../../stores/NodeSnippetsStore";

// Mock NodeContext for testing
jest.mock("../../contexts/NodeContext", () => ({
  useNodeStoreRef: jest.fn(() => ({
    getState: jest.fn(() => ({
      addNodes: jest.fn(),
      addEdges: jest.fn(),
      nodes: [],
      edges: [],
      setNodes: jest.fn(),
      setEdges: jest.fn(),
      workflowId: "test-workflow"
    }))
  }))
}));

const mockRfAddNodes = jest.fn();
jest.mock("@xyflow/react", () => {
  const actual = jest.requireActual("@xyflow/react");
  return {
    ...actual,
    useReactFlow: () => ({
      addNodes: mockRfAddNodes
    })
  };
});

import { useNodeStoreRef } from "../../contexts/NodeContext";

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

describe("useNodeSnippets", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    useNodeSnippetsStore.setState({ snippets: [] });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => {
    return React.createElement(ReactFlowProvider, null, children);
  };

  describe("saveAsSnippet", () => {
    it("should save nodes as a snippet", () => {
      const { result } = renderHook(() => useNodeSnippets(), { wrapper });

      const nodes = [createMockNode("node1", "TestNode", { x: 0, y: 0 })];
      const edges: Edge[] = [];

      const snippetId = result.current.saveAsSnippet(
        "Test Snippet",
        "Test Description",
        nodes,
        edges
      );

      expect(snippetId).toMatch(new RegExp("^snippet_[a-z0-9]+_[a-z0-9]+$"));

      const snippets = result.current.getSnippets();
      expect(snippets).toHaveLength(1);
      expect(snippets[0].name).toBe("Test Snippet");
    });

    it("should throw error when no nodes provided", () => {
      const { result } = renderHook(() => useNodeSnippets(), { wrapper });

      expect(() => {
        result.current.saveAsSnippet("Test", "Desc", [], []);
      }).toThrow("Cannot create snippet: no nodes provided");
    });
  });

  describe("restoreSnippet", () => {
    it("should restore snippet nodes and edges to workflow", () => {
      const mockAddNodes = jest.fn();
      const mockAddEdges = jest.fn();

      (useNodeStoreRef as jest.Mock).mockReturnValue({
        getState: () => ({
          addNodes: mockAddNodes,
          addEdges: mockAddEdges,
          workflowId: "test-workflow",
          nodes: [],
          edges: [],
          setNodes: jest.fn(),
          setEdges: jest.fn()
        })
      });

      const { result } = renderHook(() => useNodeSnippets(), { wrapper });

      // First create a snippet
      const nodes = [
        createMockNode("node1", "TypeA", { x: 100, y: 100 }),
        createMockNode("node2", "TypeB", { x: 300, y: 100 })
      ];
      const edges = [createMockEdge("edge1", "node1", "node2")];

      const snippetId = result.current.saveAsSnippet(
        "Test",
        "Description",
        nodes,
        edges
      );

      // Reset mocks
      mockAddNodes.mockClear();
      mockAddEdges.mockClear();

      // Restore snippet
      act(() => {
        result.current.restoreSnippet(snippetId, { x: 500, y: 500 });
      });

      expect(mockRfAddNodes).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            type: "TypeA",
            data: expect.objectContaining({
              workflow_id: ""
            })
          })
        ])
      );
    });

    it("should throw error for non-existent snippet", () => {
      const { result } = renderHook(() => useNodeSnippets(), { wrapper });

      expect(() => {
        result.current.restoreSnippet("non-existent", { x: 0, y: 0 });
      }).toThrow("Snippet not found: non-existent");
    });

    it("should apply restore offset when positioning nodes", () => {
      const mockAddNodes = jest.fn();

      (useNodeStoreRef as jest.Mock).mockReturnValue({
        getState: () => ({
          addNodes: mockAddNodes,
          addEdges: jest.fn(),
          workflowId: "test-workflow",
          nodes: [],
          edges: [],
          setNodes: jest.fn(),
          setEdges: jest.fn()
        })
      });

      const { result } = renderHook(
        () => useNodeSnippets({ restoreOffset: { x: 50, y: 100 } }),
        { wrapper }
      );

      // Create snippet at (100, 100)
      const nodes = [createMockNode("node1", "TestNode", { x: 100, y: 100 })];
      const snippetId = result.current.saveAsSnippet(
        "Test",
        "Desc",
        nodes,
        []
      );

      mockAddNodes.mockClear();

      // Restore at (500, 500)
      act(() => {
        result.current.restoreSnippet(snippetId, { x: 500, y: 500 });
      });

      // Position should be (500, 500) + offset (50, 100) - original (100, 100)
      // = (550, 600)
      const addedNodes = mockRfAddNodes.mock.calls[0][0] as Node<NodeData>[];
      expect(addedNodes[0].position.x).toBe(550);
      expect(addedNodes[0].position.y).toBe(600);
    });
  });

  describe("deleteSnippet", () => {
    it("should delete snippet by ID", () => {
      const { result } = renderHook(() => useNodeSnippets(), { wrapper });

      const nodes = [createMockNode("node1", "TestNode", { x: 0, y: 0 })];
      const snippetId = result.current.saveAsSnippet(
        "To Delete",
        "Desc",
        nodes,
        []
      );

      expect(result.current.getSnippets()).toHaveLength(1);

      act(() => {
        result.current.deleteSnippet(snippetId);
      });

      expect(result.current.getSnippets()).toHaveLength(0);
    });
  });

  describe("updateSnippet", () => {
    it("should update snippet metadata", () => {
      const { result } = renderHook(() => useNodeSnippets(), { wrapper });

      const nodes = [createMockNode("node1", "TestNode", { x: 0, y: 0 })];
      const snippetId = result.current.saveAsSnippet(
        "Original Name",
        "Original Description",
        nodes,
        []
      );

      act(() => {
        result.current.updateSnippet(snippetId, {
          name: "Updated Name",
          description: "Updated Description"
        });
      });

      const snippet = result.current.getSnippet(snippetId);
      expect(snippet?.name).toBe("Updated Name");
      expect(snippet?.description).toBe("Updated Description");
    });
  });

  describe("getSnippetsByNodeType", () => {
    it("should filter snippets by node type", () => {
      const { result } = renderHook(() => useNodeSnippets(), { wrapper });

      const nodesA = [createMockNode("node1", "TypeA", { x: 0, y: 0 })];
      const nodesB = [createMockNode("node2", "TypeB", { x: 0, y: 0 })];

      act(() => {
        result.current.saveAsSnippet("Snippet A", "Desc", nodesA, []);
        result.current.saveAsSnippet("Snippet B", "Desc", nodesB, []);
      });

      const typeASnippets = result.current.getSnippetsByNodeType("TypeA");
      expect(typeASnippets).toHaveLength(1);
      expect(typeASnippets[0].name).toBe("Snippet A");

      const typeBSnippets = result.current.getSnippetsByNodeType("TypeB");
      expect(typeBSnippets).toHaveLength(1);
      expect(typeBSnippets[0].name).toBe("Snippet B");
    });
  });
});

// Helper for act in React 18
function act(callback: () => void) {
  callback();
}
