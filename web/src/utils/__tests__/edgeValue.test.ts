import { Edge } from "@xyflow/react";
import { resolveExternalEdgeValue } from "../edgeValue";

describe("edgeValue", () => {
  const createMockNode = (id: string, type: string, properties: Record<string, unknown> = {}, dynamicProperties: Record<string, unknown> = {}): any => ({
    id,
    type,
    data: {
      properties,
      dynamicProperties,
      selectable: true,
      workflow_id: "test"
    }
  });

  const createMockEdge = (source: string, target: string, sourceHandle?: string): Edge => ({
    id: `e-${source}-${target}`,
    source,
    target,
    sourceHandle: sourceHandle || null,
    targetHandle: null,
    type: "default",
    animated: false,
    selectable: true,
    deletable: true,
    data: {},
    style: {}
  });

  const createGetResult = (results: Record<string, any>): any => 
    (workflowId: string, nodeId: string) => results[nodeId];

  const createFindNode = (nodes: any[]): any =>
    (nodeId: string) => nodes.find((n) => n.id === nodeId);

  describe("resolveExternalEdgeValue", () => {
    describe("Cached Result Available", () => {
      it("should return cached result value as object when no sourceHandle", () => {
        const edge = createMockEdge("node1", "node2");
        const getResult = createGetResult({ node1: { text: "Hello" } });
        const findNode = createFindNode([]);
        
        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);
        
        expect(result.value).toEqual({ text: "Hello" });
        expect(result.hasValue).toBe(true);
        expect(result.isFallback).toBe(false);
      });

      it("should return specific handle value when sourceHandle specified", () => {
        const edge = createMockEdge("node1", "node2", "output1");
        const getResult = createGetResult({ node1: { output1: "specific", output2: "other" } });
        const findNode = createFindNode([]);
        
        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);
        
        expect(result.value).toBe("specific");
        expect(result.hasValue).toBe(true);
        expect(result.isFallback).toBe(false);
      });

      it("should return entire result when handle not in result", () => {
        const edge = createMockEdge("node1", "node2", "missingHandle");
        const getResult = createGetResult({ node1: { otherKey: "value" } });
        const findNode = createFindNode([]);
        
        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);
        
        expect(result.value).toEqual({ otherKey: "value" });
      });

      it("should return direct value without object wrapping", () => {
        const edge = createMockEdge("node1", "node2");
        const getResult = createGetResult({ node1: "direct string value" });
        const findNode = createFindNode([]);
        
        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);
        
        expect(result.value).toBe("direct string value");
      });

      it("should handle primitive result values", () => {
        const edge = createMockEdge("node1", "node2");
        const getResult = createGetResult({ node1: 42 });
        const findNode = createFindNode([]);
        
        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);
        
        expect(result.value).toBe(42);
        expect(result.hasValue).toBe(true);
      });

      it("should handle boolean result values", () => {
        const edge = createMockEdge("node1", "node2");
        const getResult = createGetResult({ node1: true });
        const findNode = createFindNode([]);
        
        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);
        
        expect(result.value).toBe(true);
        expect(result.hasValue).toBe(true);
      });
    });

    describe("No Cached Result", () => {
      it("should return no value when result is undefined", () => {
        const edge = createMockEdge("node1", "node2");
        const getResult = createGetResult({});
        const findNode = createFindNode([]);
        
        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);
        
        expect(result.value).toBeUndefined();
        expect(result.hasValue).toBe(false);
        expect(result.isFallback).toBe(false);
      });

      it("should return no value when source node not found", () => {
        const edge = createMockEdge("node1", "node2");
        const getResult = createGetResult({});
        const findNode = createFindNode([]);
        
        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);
        
        expect(result.value).toBeUndefined();
        expect(result.hasValue).toBe(false);
        expect(result.isFallback).toBe(false);
      });

      it("should return no value when node is not literal source", () => {
        const edge = createMockEdge("node1", "node2");
        const getResult = createGetResult({});
        const findNode = createFindNode([createMockNode("node1", "process_node")]);
        
        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);
        
        expect(result.value).toBeUndefined();
        expect(result.hasValue).toBe(false);
        expect(result.isFallback).toBe(false);
      });
    });

    describe("Fallback Value from Source Node", () => {
      it("should get fallback from properties.value", () => {
        const edge = createMockEdge("node1", "node2");
        const getResult = createGetResult({});
        const findNode = createFindNode([createMockNode("node1", "nodetool.constant.number", { value: 42 })]);
        
        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);
        
        expect(result.value).toBe(42);
        expect(result.hasValue).toBe(true);
        expect(result.isFallback).toBe(true);
      });

      it("should get fallback from specific handle in properties", () => {
        const edge = createMockEdge("node1", "node2", "text");
        const getResult = createGetResult({});
        const findNode = createFindNode([createMockNode("node1", "nodetool.constant.string", { text: "specific fallback" })]);
        
        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);
        
        expect(result.value).toBe("specific fallback");
        expect(result.hasValue).toBe(true);
        expect(result.isFallback).toBe(true);
      });

      it("should prefer properties.value over dynamic_properties.value", () => {
        const edge = createMockEdge("node1", "node2");
        const getResult = createGetResult({});
        const findNode = createFindNode([createMockNode("node1", "nodetool.constant.string", { value: "from properties" }, { value: "from dynamic" })]);
        
        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);
        
        expect(result.value).toBe("from properties");
      });

      it("should get fallback from input node", () => {
        const edge = createMockEdge("node1", "node2");
        const getResult = createGetResult({});
        const findNode = createFindNode([createMockNode("node1", "nodetool.input.text", { value: "input value" })]);
        
        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);
        
        expect(result.value).toBe("input value");
        expect(result.hasValue).toBe(true);
        expect(result.isFallback).toBe(true);
      });

      it("should get fallback from properties even when dynamic_properties has value", () => {
        const edge = createMockEdge("node1", "node2");
        const getResult = createGetResult({});
        const findNode = createFindNode([createMockNode("node1", "nodetool.constant.string", { value: "from properties" }, { value: "from dynamic" })]);
        
        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);
        
        expect(result.value).toBe("from properties");
        expect(result.hasValue).toBe(true);
        expect(result.isFallback).toBe(true);
      });
    });

    describe("Source Node Type Detection", () => {
      it("should recognize nodetool.input nodes", () => {
        const edge = createMockEdge("node1", "node2");
        const getResult = createGetResult({});
        const findNode = createFindNode([createMockNode("node1", "nodetool.input.image", { value: "img.png" })]);
        
        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);
        
        expect(result.hasValue).toBe(true);
      });

      it("should recognize nodetool.constant nodes", () => {
        const edge = createMockEdge("node1", "node2");
        const getResult = createGetResult({});
        const findNode = createFindNode([createMockNode("node1", "nodetool.constant.boolean", { value: true })]);
        
        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);
        
        expect(result.hasValue).toBe(true);
      });

      it("should not recognize custom.input as literal", () => {
        const edge = createMockEdge("node1", "node2");
        const getResult = createGetResult({});
        const findNode = createFindNode([createMockNode("node1", "custom.input", { value: "test" })]);
        
        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);
        
        expect(result.hasValue).toBe(false);
      });
    });

    describe("Edge Cases", () => {
      it("should handle undefined result gracefully", () => {
        const edge = createMockEdge("node1", "node2");
        const getResult = () => undefined;
        const findNode = createFindNode([]);
        
        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);
        
        expect(result.value).toBeUndefined();
        expect(result.hasValue).toBe(false);
      });

      it("should handle null result gracefully", () => {
        const edge = createMockEdge("node1", "node2");
        const getResult = () => null;
        const findNode = createFindNode([]);
        
        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);
        
        expect(result.value).toBeNull();
        expect(result.hasValue).toBe(true);
      });

      it("should handle edge with empty string sourceHandle", () => {
        const edge = createMockEdge("node1", "node2", "");
        const getResult = createGetResult({ node1: { "": "empty handle value" } });
        const findNode = createFindNode([]);
        
        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);
        
        expect(result.value).toEqual({ "": "empty handle value" });
      });

      it("should handle edge when result is empty object", () => {
        const edge = createMockEdge("node1", "node2");
        const getResult = createGetResult({ node1: {} });
        const findNode = createFindNode([]);
        
        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);
        
        expect(result.value).toEqual({});
        expect(result.hasValue).toBe(true);
      });
    });
  });
});
