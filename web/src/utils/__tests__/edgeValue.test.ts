import { Edge, Node } from "@xyflow/react";
import { resolveExternalEdgeValue } from "../edgeValue";
import { NodeData } from "../stores/NodeData";

const createMockNode = (id: string, type?: string, properties?: Record<string, any>, dynamicProperties?: Record<string, any>): Node<NodeData> => ({
  id,
  type: type || "test",
  position: { x: 0, y: 0 },
  data: {
    properties: properties || {},
    dynamic_properties: dynamicProperties || {},
    selectable: true,
    workflow_id: "test-workflow"
  }
});

const createEdge = (source: string, target: string, sourceHandle?: string, targetHandle?: string): Edge => ({
  id: `${source}-${target}`,
  source,
  target,
  sourceHandle: sourceHandle || null,
  targetHandle: targetHandle || null
});

describe("edgeValue", () => {
  describe("resolveExternalEdgeValue", () => {
    describe("when result exists", () => {
      it("returns result value from getResult", () => {
        const edge = createEdge("node1", "node2");
        const getResult = jest.fn().mockReturnValue("test-value");
        const findNode = jest.fn();

        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);

        expect(result).toEqual({
          value: "test-value",
          hasValue: true,
          isFallback: false
        });
        expect(getResult).toHaveBeenCalledWith("workflow1", "node1");
        expect(findNode).not.toHaveBeenCalled();
      });

      it("resolves result value with sourceHandle", () => {
        const edge = createEdge("node1", "node2", "handle1", "handle2");
        const getResult = jest.fn().mockReturnValue({ handle1: "value1", handle2: "value2" });
        const findNode = jest.fn();

        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);

        expect(result).toEqual({
          value: "value1",
          hasValue: true,
          isFallback: false
        });
      });

      it("returns full result when sourceHandle not in result object", () => {
        const edge = createEdge("node1", "node2", "missingHandle");
        const getResult = jest.fn().mockReturnValue({ someValue: "data" });
        const findNode = jest.fn();

        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);

        expect(result).toEqual({
          value: { someValue: "data" },
          hasValue: true,
          isFallback: false
        });
      });

      it("handles non-object result values", () => {
        const edge = createEdge("node1", "node2");
        const getResult = jest.fn().mockReturnValue(42);
        const findNode = jest.fn();

        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);

        expect(result).toEqual({
          value: 42,
          hasValue: true,
          isFallback: false
        });
      });
    });

    describe("when result is undefined", () => {
      it("falls back to node property for literal source nodes", () => {
        const edge = createEdge("node1", "node2");
        const mockNode = createMockNode("node1", "nodetool.input.TextInput", { value: "input-value" });
        const getResult = jest.fn().mockReturnValue(undefined);
        const findNode = jest.fn().mockReturnValue(mockNode);

        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);

        expect(result).toEqual({
          value: "input-value",
          hasValue: true,
          isFallback: true
        });
      });

      it("falls back to constant node property", () => {
        const edge = createEdge("node1", "node2");
        const mockNode = createMockNode("node1", "nodetool.constant.Number", { value: 123 });
        const getResult = jest.fn().mockReturnValue(undefined);
        const findNode = jest.fn().mockReturnValue(mockNode);

        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);

        expect(result).toEqual({
          value: 123,
          hasValue: true,
          isFallback: true
        });
      });

      it("returns no value for non-literal source nodes", () => {
        const edge = createEdge("node1", "node2");
        const mockNode = createMockNode("node1", "nodetool.process.Transform", {});
        const getResult = jest.fn().mockReturnValue(undefined);
        const findNode = jest.fn().mockReturnValue(mockNode);

        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);

        expect(result).toEqual({
          value: undefined,
          hasValue: false,
          isFallback: false
        });
      });

      it("returns no value when source node not found", () => {
        const edge = createEdge("node1", "node2");
        const getResult = jest.fn().mockReturnValue(undefined);
        const findNode = jest.fn().mockReturnValue(undefined);

        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);

        expect(result).toEqual({
          value: undefined,
          hasValue: false,
          isFallback: false
        });
      });
    });

    describe("source handle resolution", () => {
      it("resolves dynamic_properties[sourceHandle] first", () => {
        const edge = createEdge("node1", "node2", "prop1");
        const mockNode = createMockNode(
          "node1",
          "nodetool.input.TextInput",
          {},
          { prop1: "dynamic-value" }
        );
        const getResult = jest.fn().mockReturnValue(undefined);
        const findNode = jest.fn().mockReturnValue(mockNode);

        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);

        expect(result.value).toBe("dynamic-value");
        expect(result.isFallback).toBe(true);
      });

      it("falls back to dynamic_properties.value", () => {
        const edge = createEdge("node1", "node2");
        const mockNode = createMockNode(
          "node1",
          "nodetool.input.TextInput",
          {},
          { value: "dynamic-default" }
        );
        const getResult = jest.fn().mockReturnValue(undefined);
        const findNode = jest.fn().mockReturnValue(mockNode);

        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);

        expect(result.value).toBe("dynamic-default");
        expect(result.isFallback).toBe(true);
      });

      it("falls back to properties[sourceHandle]", () => {
        const edge = createEdge("node1", "node2", "prop1");
        const mockNode = createMockNode(
          "node1",
          "nodetool.input.TextInput",
          { prop1: "static-value" }
        );
        const getResult = jest.fn().mockReturnValue(undefined);
        const findNode = jest.fn().mockReturnValue(mockNode);

        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);

        expect(result.value).toBe("static-value");
        expect(result.isFallback).toBe(true);
      });

      it("falls back to properties.value", () => {
        const edge = createEdge("node1", "node2");
        const mockNode = createMockNode(
          "node1",
          "nodetool.input.TextInput",
          { value: "static-default" }
        );
        const getResult = jest.fn().mockReturnValue(undefined);
        const findNode = jest.fn().mockReturnValue(mockNode);

        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);

        expect(result.value).toBe("static-default");
        expect(result.isFallback).toBe(true);
      });

      it("returns undefined when no value found in any location", () => {
        const edge = createEdge("node1", "node2", "missing");
        const mockNode = createMockNode("node1", "nodetool.input.TextInput", {}, {});
        const getResult = jest.fn().mockReturnValue(undefined);
        const findNode = jest.fn().mockReturnValue(mockNode);

        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);

        expect(result).toEqual({
          value: undefined,
          hasValue: false,
          isFallback: true
        });
      });
    });

    describe("edge cases", () => {
      it("handles edge with null sourceHandle", () => {
        const edge: Edge = {
          id: "edge1",
          source: "node1",
          target: "node2",
          sourceHandle: null,
          targetHandle: null
        };
        const mockNode = createMockNode("node1", "nodetool.input.TextInput", { value: "test" });
        const getResult = jest.fn().mockReturnValue(undefined);
        const findNode = jest.fn().mockReturnValue(mockNode);

        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);

        expect(result.value).toBe("test");
      });

      it("handles null result value explicitly", () => {
        const edge = createEdge("node1", "node2");
        const getResult = jest.fn().mockReturnValue(null);
        const findNode = jest.fn();

        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);

        expect(result.value).toBeNull();
        expect(result.hasValue).toBe(true);
      });

      it("handles undefined result with empty dynamic_properties", () => {
        const edge = createEdge("node1", "node2");
        const mockNode = createMockNode("node1", "nodetool.input.TextInput", undefined, undefined);
        const getResult = jest.fn().mockReturnValue(undefined);
        const findNode = jest.fn().mockReturnValue(mockNode);

        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);

        expect(result.hasValue).toBe(false);
        expect(result.isFallback).toBe(true);
      });
    });
  });
});
