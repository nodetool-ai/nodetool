import { Edge } from "@xyflow/react";
import { resolveExternalEdgeValue } from "../edgeValue";
import { NodeData } from "../../stores/NodeData";
import { Node } from "@xyflow/react";

describe("edgeValue", () => {
  describe("resolveExternalEdgeValue", () => {
    const createMockGetResult = (results: Record<string, any>) => {
      return (workflowId: string, nodeId: string) => {
        return results[nodeId];
      };
    };

    const createMockFindNode = (nodes: Record<string, Node<NodeData>>) => {
      return (nodeId: string) => {
        return nodes[nodeId];
      };
    };

    it("returns result value when getResult returns a value", () => {
      const edge: Edge = {
        id: "e1",
        source: "node1",
        target: "node2",
        type: "default"
      };
      const getResult = createMockGetResult({ node1: { result: "test value" } });
      const findNode = createMockFindNode({});

      const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);

      expect(result.value).toEqual({ result: "test value" });
      expect(result.hasValue).toBe(true);
      expect(result.isFallback).toBe(false);
    });

    it("returns result value with sourceHandle", () => {
      const edge: Edge = {
        id: "e1",
        source: "node1",
        target: "node2",
        sourceHandle: "output1",
        type: "default"
      };
      const getResult = createMockGetResult({ node1: { output1: "handle value", other: "other" } });
      const findNode = createMockFindNode({});

      const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);

      expect(result.value).toBe("handle value");
      expect(result.hasValue).toBe(true);
    });

    it("falls back to entire result when sourceHandle not in result", () => {
      const edge: Edge = {
        id: "e1",
        source: "node1",
        target: "node2",
        sourceHandle: "missing",
        type: "default"
      };
      const getResult = createMockGetResult({ node1: { output1: "value" } });
      const findNode = createMockFindNode({});

      const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);

      expect(result.value).toEqual({ output1: "value" });
      expect(result.hasValue).toBe(true);
    });

    it("returns no value when getResult returns undefined and no literal source", () => {
      const edge: Edge = {
        id: "e1",
        source: "node1",
        target: "node2",
        type: "default"
      };
      const getResult = createMockGetResult({});
      const findNode = createMockFindNode({});

      const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);

      expect(result.value).toBeUndefined();
      expect(result.hasValue).toBe(false);
      expect(result.isFallback).toBe(false);
    });

    it("uses fallback from literal source node property", () => {
      const edge: Edge = {
        id: "e1",
        source: "node1",
        target: "node2",
        type: "default"
      };
      const getResult = createMockGetResult({});
      const literalNode: Node<NodeData> = {
        id: "node1",
        type: "nodetool.constant.String",
        data: { properties: { value: "fallback value" } },
        position: { x: 0, y: 0 }
      } as Node<NodeData>;
      const findNode = createMockFindNode({ node1: literalNode });

      const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);

      expect(result.value).toBe("fallback value");
      expect(result.hasValue).toBe(true);
      expect(result.isFallback).toBe(true);
    });

    it("uses fallback from dynamic_properties", () => {
      const edge: Edge = {
        id: "e1",
        source: "node1",
        target: "node2",
        type: "default"
      };
      const getResult = createMockGetResult({});
      const literalNode: Node<NodeData> = {
        id: "node1",
        type: "nodetool.constant.String",
        data: { dynamic_properties: { value: "dynamic value" } },
        position: { x: 0, y: 0 }
      } as Node<NodeData>;
      const findNode = createMockFindNode({ node1: literalNode });

      const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);

      expect(result.value).toBe("dynamic value");
      expect(result.hasValue).toBe(true);
      expect(result.isFallback).toBe(true);
    });

    it("does not use fallback for non-literal source nodes", () => {
      const edge: Edge = {
        id: "e1",
        source: "node1",
        target: "node2",
        type: "default"
      };
      const getResult = createMockGetResult({});
      const processNode: Node<NodeData> = {
        id: "node1",
        type: "nodetool.process.TextConcatenate",
        data: { properties: { value: "should not use" } },
        position: { x: 0, y: 0 }
      } as Node<NodeData>;
      const findNode = createMockFindNode({ node1: processNode });

      const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);

      expect(result.hasValue).toBe(false);
      expect(result.isFallback).toBe(false);
    });

    it("handles nodetool.input nodes as literal sources", () => {
      const edge: Edge = {
        id: "e1",
        source: "node1",
        target: "node2",
        type: "default"
      };
      const getResult = createMockGetResult({});
      const inputNode: Node<NodeData> = {
        id: "node1",
        type: "nodetool.input.TextInput",
        data: { properties: { value: "input value" } },
        position: { x: 0, y: 0 }
      } as Node<NodeData>;
      const findNode = createMockFindNode({ node1: inputNode });

      const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);

      expect(result.value).toBe("input value");
      expect(result.hasValue).toBe(true);
      expect(result.isFallback).toBe(true);
    });

    it("handles undefined result value correctly", () => {
      const edge: Edge = {
        id: "e1",
        source: "node1",
        target: "node2",
        type: "default"
      };
      const getResult = createMockGetResult({ node1: undefined });
      const findNode = createMockFindNode({});

      const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);

      expect(result.value).toBeUndefined();
      expect(result.hasValue).toBe(false);
    });
  });
});
