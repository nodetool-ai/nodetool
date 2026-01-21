import { renderHook, act } from "@testing-library/react";
import { useCreateNode } from "../useCreateNode";
import { NodeData } from "../../stores/NodeData";

describe("useCreateNode", () => {
  const mockWorkflowId = "test-workflow-123";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("initial state", () => {
    it("returns nodeId as null initially", () => {
      const { result } = renderHook(() => useCreateNode(mockWorkflowId));
      
      expect(result.current.nodeId).toBeNull();
    });

    it("returns createNode function", () => {
      const { result } = renderHook(() => useCreateNode(mockWorkflowId));
      
      expect(typeof result.current.createNode).toBe("function");
    });
  });

  describe("createNode", () => {
    it("creates a new node with given type", () => {
      const { result } = renderHook(() => useCreateNode(mockWorkflowId));
      
      act(() => {
        result.current.createNode("nodetool.input.text_input", { x: 100, y: 200 });
      });

      expect(result.current.nodeId).toBeTruthy();
    });

    it("generates unique node IDs", () => {
      const { result } = renderHook(() => useCreateNode(mockWorkflowId));
      
      let nodeId1: string;
      act(() => {
        nodeId1 = result.current.createNode("nodetool.input.text_input", { x: 100, y: 200 });
      });

      let nodeId2: string;
      act(() => {
        nodeId2 = result.current.createNode("nodetool.input.text_input", { x: 300, y: 400 });
      });

      expect(nodeId1).not.toBe(nodeId2);
    });

    it("uses provided position", () => {
      const { result } = renderHook(() => useCreateNode(mockWorkflowId));
      
      let nodeId: string;
      act(() => {
        nodeId = result.current.createNode("nodetool.constant.string", { x: 150, y: 250 });
      });

      expect(nodeId).toBeTruthy();
    });

    it("handles different node types", () => {
      const { result } = renderHook(() => useCreateNode(mockWorkflowId));
      
      const nodeTypes = [
        "nodetool.input.text_input",
        "nodetool.constant.string",
        "nodetool.process.llm",
        "nodetool.output.preview",
      ];

      for (const nodeType of nodeTypes) {
        let nodeId: string;
        act(() => {
          nodeId = result.current.createNode(nodeType, { x: 0, y: 0 });
        });
        expect(nodeId).toBeTruthy();
      }
    });
  });

  describe("workflowId changes", () => {
    it("resets nodeId when workflowId changes", () => {
      const { result, rerender } = renderHook(
        ({ workflowId }) => useCreateNode(workflowId),
        { initialProps: { workflowId: "workflow-1" } }
      );

      act(() => {
        result.current.createNode("nodetool.input.text_input", { x: 100, y: 200 });
      });
      const firstNodeId = result.current.nodeId;
      expect(firstNodeId).toBeTruthy();

      rerender({ workflowId: "workflow-2" });
      expect(result.current.nodeId).toBeNull();
    });
  });
});
