import { Edge, Node } from "@xyflow/react";
import { resolveExternalEdgeValue } from "../edgeValue";
import { NodeData } from "../../stores/NodeData";

const createMockNode = (
  id: string,
  type?: string,
  properties: Record<string, unknown> = {},
  dynamicProperties: Record<string, unknown> = {}
): Node<NodeData> => ({
  id,
  type: type || "default",
  position: { x: 0, y: 0 },
  data: {
    properties,
    dynamic_properties: dynamicProperties,
    selectable: true,
    workflow_id: "test-workflow"
  }
});

describe("edgeValue", () => {
  describe("resolveExternalEdgeValue", () => {
    const workflowId = "test-workflow";
    const mockGetResult = jest.fn();
    const mockFindNode = jest.fn();

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it("returns result from getResult when available", () => {
      const edge: Edge = {
        id: "e1",
        source: "node1",
        target: "node2",
        sourceHandle: "output",
        targetHandle: "input",
        type: "default"
      };
      mockGetResult.mockReturnValue({ output: "test-value" });

      const result = resolveExternalEdgeValue(edge, workflowId, mockGetResult, mockFindNode);

      expect(result).toEqual({
        value: "test-value",
        hasValue: true,
        isFallback: false
      });
      expect(mockGetResult).toHaveBeenCalledWith(workflowId, "node1");
    });

    it("falls back to node property when getResult returns undefined", () => {
      const edge: Edge = {
        id: "e1",
        source: "node1",
        target: "node2",
        sourceHandle: "output",
        targetHandle: "input",
        type: "default"
      };
      const mockNode = createMockNode("node1", "nodetool.input.TextInput", { value: "fallback-value" });
      mockGetResult.mockReturnValue(undefined);
      mockFindNode.mockReturnValue(mockNode);

      const result = resolveExternalEdgeValue(edge, workflowId, mockGetResult, mockFindNode);

      expect(result).toEqual({
        value: "fallback-value",
        hasValue: true,
        isFallback: true
      });
    });

    it("returns hasValue false when no value available", () => {
      const edge: Edge = {
        id: "e1",
        source: "node1",
        target: "node2",
        type: "default"
      };
      mockGetResult.mockReturnValue(undefined);
      mockFindNode.mockReturnValue(createMockNode("node1", "default"));

      const result = resolveExternalEdgeValue(edge, workflowId, mockGetResult, mockFindNode);

      expect(result).toEqual({
        value: undefined,
        hasValue: false,
        isFallback: false
      });
    });

    it("checks dynamic_properties before properties", () => {
      const edge: Edge = {
        id: "e1",
        source: "node1",
        target: "node2",
        type: "default"
      };
      const mockNode = createMockNode(
        "node1",
        "nodetool.input.TextInput",
        { value: "prop-value" },
        { value: "dynamic-value" }
      );
      mockGetResult.mockReturnValue(undefined);
      mockFindNode.mockReturnValue(mockNode);

      const result = resolveExternalEdgeValue(edge, workflowId, mockGetResult, mockFindNode);

      expect(result.value).toBe("dynamic-value");
    });

    it("uses sourceHandle to resolve nested result", () => {
      const edge: Edge = {
        id: "e1",
        source: "node1",
        target: "node2",
        sourceHandle: "text_output",
        type: "default"
      };
      mockGetResult.mockReturnValue({ text_output: "text-value", audio_output: "audio-value" });

      const result = resolveExternalEdgeValue(edge, workflowId, mockGetResult, mockFindNode);

      expect(result.value).toBe("text-value");
    });

    it("returns full result when sourceHandle not in result object", () => {
      const edge: Edge = {
        id: "e1",
        source: "node1",
        target: "node2",
        sourceHandle: "missing_handle",
        type: "default"
      };
      mockGetResult.mockReturnValue({ text_output: "text-value" });

      const result = resolveExternalEdgeValue(edge, workflowId, mockGetResult, mockFindNode);

      expect(result.value).toEqual({ text_output: "text-value" });
    });

    it("handles non-literal source nodes", () => {
      const edge: Edge = {
        id: "e1",
        source: "node1",
        target: "node2",
        type: "default"
      };
      const mockNode = createMockNode("node1", "nodetool.processors.TextProcessor", { value: "should-not-use" });
      mockGetResult.mockReturnValue(undefined);
      mockFindNode.mockReturnValue(mockNode);

      const result = resolveExternalEdgeValue(edge, workflowId, mockGetResult, mockFindNode);

      expect(result.hasValue).toBe(false);
    });

    it("handles constant node types as fallback source", () => {
      const edge: Edge = {
        id: "e1",
        source: "node1",
        target: "node2",
        type: "default"
      };
      const mockNode = createMockNode("node1", "nodetool.constant.String", { value: "constant-value" });
      mockGetResult.mockReturnValue(undefined);
      mockFindNode.mockReturnValue(mockNode);

      const result = resolveExternalEdgeValue(edge, workflowId, mockGetResult, mockFindNode);

      expect(result.value).toBe("constant-value");
      expect(result.isFallback).toBe(true);
    });

    it("handles undefined sourceHandle", () => {
      const edge: Edge = {
        id: "e1",
        source: "node1",
        target: "node2",
        sourceHandle: undefined,
        type: "default"
      };
      mockGetResult.mockReturnValue("simple-value");

      const result = resolveExternalEdgeValue(edge, workflowId, mockGetResult, mockFindNode);

      expect(result.value).toBe("simple-value");
    });

    it("handles null sourceNode", () => {
      const edge: Edge = {
        id: "e1",
        source: "node1",
        target: "node2",
        type: "default"
      };
      mockGetResult.mockReturnValue(undefined);
      mockFindNode.mockReturnValue(undefined);

      const result = resolveExternalEdgeValue(edge, workflowId, mockGetResult, mockFindNode);

      expect(result.hasValue).toBe(false);
    });

    it("uses value property when no sourceHandle specified", () => {
      const edge: Edge = {
        id: "e1",
        source: "node1",
        target: "node2",
        type: "default"
      };
      const mockNode = createMockNode("node1", "nodetool.input.TextInput", {}, { value: "direct-value" });
      mockGetResult.mockReturnValue(undefined);
      mockFindNode.mockReturnValue(mockNode);

      const result = resolveExternalEdgeValue(edge, workflowId, mockGetResult, mockFindNode);

      expect(result.value).toBe("direct-value");
    });

    it("resolves sourceHandle from dynamic_properties", () => {
      const edge: Edge = {
        id: "e1",
        source: "node1",
        target: "node2",
        sourceHandle: "custom_handle",
        type: "default"
      };
      const mockNode = createMockNode(
        "node1",
        "nodetool.input.TextInput",
        {},
        { custom_handle: "dynamic-handle-value" }
      );
      mockGetResult.mockReturnValue(undefined);
      mockFindNode.mockReturnValue(mockNode);

      const result = resolveExternalEdgeValue(edge, workflowId, mockGetResult, mockFindNode);

      expect(result.value).toBe("dynamic-handle-value");
    });

    it("resolves sourceHandle from properties", () => {
      const edge: Edge = {
        id: "e1",
        source: "node1",
        target: "node2",
        sourceHandle: "custom_handle",
        type: "default"
      };
      const mockNode = createMockNode(
        "node1",
        "nodetool.input.TextInput",
        { custom_handle: "prop-handle-value" }
      );
      mockGetResult.mockReturnValue(undefined);
      mockFindNode.mockReturnValue(mockNode);

      const result = resolveExternalEdgeValue(edge, workflowId, mockGetResult, mockFindNode);

      expect(result.value).toBe("prop-handle-value");
    });
  });
});
