import { Edge } from "@xyflow/react";
import { resolveExternalEdgeValue } from "../edgeValue";
import { NodeData } from "../stores/NodeData";

describe("edgeValue utility", () => {
  const createMockGetResult = (results: Record<string, any>) => {
    return (workflowId: string, nodeId: string) => {
      return results[`${workflowId}:${nodeId}`];
    };
  };

  const createMockFindNode = (nodes: Record<string, any>) => {
    return (nodeId: string) => {
      return nodes[nodeId];
    };
  };

  describe("resolveExternalEdgeValue", () => {
    it("returns hasValue=true when result exists", () => {
      const getResult = createMockGetResult({ "wf-1:node1": "test-value" });
      const findNode = createMockFindNode({});
      
      const edge: Edge = {
        id: "e1",
        source: "node1",
        target: "node2",
        sourceHandle: "output",
        targetHandle: "input",
        type: "default"
      };
      
      const result = resolveExternalEdgeValue(edge, "wf-1", getResult, findNode);
      expect(result.hasValue).toBe(true);
      expect(result.value).toBe("test-value");
      expect(result.isFallback).toBe(false);
    });

    it("returns hasValue=false when no result and no source node", () => {
      const getResult = createMockGetResult({});
      const findNode = createMockFindNode({});
      
      const edge: Edge = {
        id: "e1",
        source: "node1",
        target: "node2",
        type: "default"
      };
      
      const result = resolveExternalEdgeValue(edge, "wf-1", getResult, findNode);
      expect(result.hasValue).toBe(false);
      expect(result.value).toBeUndefined();
      expect(result.isFallback).toBe(false);
    });

    it("returns isFallback=true for literal source nodes without results", () => {
      const getResult = createMockGetResult({});
      const findNode = createMockFindNode({
        node1: {
          id: "node1",
          type: "nodetool.input.TextInput",
          data: { properties: { value: "fallback" } }
        }
      });
      
      const edge: Edge = {
        id: "e1",
        source: "node1",
        target: "node2",
        type: "default"
      };
      
      const result = resolveExternalEdgeValue(edge, "wf-1", getResult, findNode);
      expect(result.hasValue).toBe(true);
      expect(result.value).toBe("fallback");
      expect(result.isFallback).toBe(true);
    });

    it("handles non-literal source nodes without fallback", () => {
      const getResult = createMockGetResult({});
      const findNode = createMockFindNode({
        node1: {
          id: "node1",
          type: "custom.processor",
          data: {}
        }
      });
      
      const edge: Edge = {
        id: "e1",
        source: "node1",
        target: "node2",
        type: "default"
      };
      
      const result = resolveExternalEdgeValue(edge, "wf-1", getResult, findNode);
      expect(result.hasValue).toBe(false);
      expect(result.isFallback).toBe(false);
    });

    it("extracts sourceHandle from result object", () => {
      const getResult = createMockGetResult({
        "wf-1:node1": { text: "text-value", image: "image-value" }
      });
      const findNode = createMockFindNode({});
      
      const edge: Edge = {
        id: "e1",
        source: "node1",
        target: "node2",
        sourceHandle: "text",
        targetHandle: "input",
        type: "default"
      };
      
      const result = resolveExternalEdgeValue(edge, "wf-1", getResult, findNode);
      expect(result.value).toBe("text-value");
    });

    it("falls back to entire result when sourceHandle not in result", () => {
      const getResult = createMockGetResult({
        "wf-1:node1": { other: "value" }
      });
      const findNode = createMockFindNode({});
      
      const edge: Edge = {
        id: "e1",
        source: "node1",
        target: "node2",
        sourceHandle: "missing",
        targetHandle: "input",
        type: "default"
      };
      
      const result = resolveExternalEdgeValue(edge, "wf-1", getResult, findNode);
      expect(result.value).toEqual({ other: "value" });
    });

    it("handles constant input nodes", () => {
      const getResult = createMockGetResult({});
      const findNode = createMockFindNode({
        node1: {
          id: "node1",
          type: "nodetool.constant.Text",
          data: { properties: { value: "constant-value" } }
        }
      });
      
      const edge: Edge = {
        id: "e1",
        source: "node1",
        target: "node2",
        type: "default"
      };
      
      const result = resolveExternalEdgeValue(edge, "wf-1", getResult, findNode);
      expect(result.value).toBe("constant-value");
      expect(result.isFallback).toBe(true);
    });
  });
});
