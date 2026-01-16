import { resolveExternalEdgeValue } from "../edgeValue";
import { Edge } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";

describe("edgeValue", () => {
  describe("resolveExternalEdgeValue", () => {
    const createMockEdge = (overrides: Partial<Edge> = {}): Edge => ({
      id: "e1",
      source: "node1",
      target: "node2",
      sourceHandle: "output1",
      targetHandle: "input1",
      type: "default",
      animated: false,
      style: {},
      ...overrides
    });

    const createMockNode = (
      id: string,
      type?: string,
      properties: Record<string, any> = {},
      dynamicProperties: Record<string, any> = {}
    ) => ({
      id,
      type,
      position: { x: 0, y: 0 },
      data: {
        properties,
        dynamic_properties: dynamicProperties,
        collapsed: false,
        selectable: true,
        workflow_id: "test"
      } as NodeData,
      width: 100,
      height: 100
    });

    describe("when result exists in workflow", () => {
      it("returns the result value when found", () => {
        const edge = createMockEdge();
        const getResult = jest.fn().mockReturnValue({ output1: "test-value" });
        const findNode = jest.fn();

        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);

        expect(result.hasValue).toBe(true);
        expect(result.value).toBe("test-value");
        expect(result.isFallback).toBe(false);
        expect(getResult).toHaveBeenCalledWith("workflow1", "node1");
        expect(findNode).not.toHaveBeenCalled();
      });

      it("returns result without sourceHandle when result is object", () => {
        const edge = createMockEdge({ sourceHandle: "output1" });
        const getResult = jest.fn().mockReturnValue({ output1: "direct-value" });
        const findNode = jest.fn();

        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);

        expect(result.value).toBe("direct-value");
      });

      it("returns full result object when sourceHandle not in result", () => {
        const edge = createMockEdge({ sourceHandle: "missing" });
        const getResult = jest.fn().mockReturnValue({ otherKey: "full-object" });
        const findNode = jest.fn();

        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);

        expect(result.value).toEqual({ otherKey: "full-object" });
      });
    });

    describe("when result does not exist - fallback to literal nodes", () => {
      it("returns undefined for non-literal source nodes", () => {
        const edge = createMockEdge();
        const getResult = jest.fn().mockReturnValue(undefined);
        const findNode = jest.fn().mockReturnValue(
          createMockNode("node1", "nodetool.processor.text")
        );

        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);

        expect(result.hasValue).toBe(false);
        expect(result.value).toBeUndefined();
        expect(result.isFallback).toBe(false);
      });

      it("uses fallback value for input nodes", () => {
        const edge = createMockEdge({ sourceHandle: "value" });
        const getResult = jest.fn().mockReturnValue(undefined);
        const findNode = jest.fn().mockReturnValue(
          createMockNode("node1", "nodetool.input.text", { value: "default-text" })
        );

        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);

        expect(result.hasValue).toBe(true);
        expect(result.value).toBe("default-text");
        expect(result.isFallback).toBe(true);
      });

      it("uses fallback value for constant nodes", () => {
        const edge = createMockEdge({ sourceHandle: "output" });
        const getResult = jest.fn().mockReturnValue(undefined);
        const findNode = jest.fn().mockReturnValue(
          createMockNode("node1", "nodetool.constant.number", {}, { value: 42 })
        );

        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);

        expect(result.hasValue).toBe(true);
        expect(result.value).toBe(42);
        expect(result.isFallback).toBe(true);
      });

      it("prefers dynamic_properties over properties for fallback", () => {
        const edge = createMockEdge({ sourceHandle: "value" });
        const getResult = jest.fn().mockReturnValue(undefined);
        const findNode = jest.fn().mockReturnValue(
          createMockNode("node1", "nodetool.input.text", { value: "static" }, { value: "dynamic" })
        );

        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);

        expect(result.value).toBe("dynamic");
      });

      it("uses sourceHandle-specific dynamic property", () => {
        const edge = createMockEdge({ sourceHandle: "port1" });
        const getResult = jest.fn().mockReturnValue(undefined);
        const findNode = jest.fn().mockReturnValue(
          createMockNode("node1", "nodetool.input.text", {}, { port1: "specific-value" })
        );

        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);

        expect(result.value).toBe("specific-value");
      });

      it("returns undefined hasValue false when literal node has no value", () => {
        const edge = createMockEdge({ sourceHandle: "missing" });
        const getResult = jest.fn().mockReturnValue(undefined);
        const findNode = jest.fn().mockReturnValue(
          createMockNode("node1", "nodetool.input.text", {})
        );

        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);

        expect(result.hasValue).toBe(false);
        expect(result.value).toBeUndefined();
      });
    });

    describe("edge cases", () => {
      it("handles null source node", () => {
        const edge = createMockEdge();
        const getResult = jest.fn().mockReturnValue(undefined);
        const findNode = jest.fn().mockReturnValue(undefined);

        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);

        expect(result.hasValue).toBe(false);
        expect(result.isFallback).toBe(false);
      });

      it("handles undefined sourceHandle", () => {
        const edge = createMockEdge({ sourceHandle: undefined });
        const getResult = jest.fn().mockReturnValue({ output1: "value" });
        const findNode = jest.fn();

        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);

        expect(result.value).toEqual({ output1: "value" });
      });

      it("handles null sourceHandle explicitly", () => {
        const edge = createMockEdge({ sourceHandle: null });
        const getResult = jest.fn().mockReturnValue("direct-result");
        const findNode = jest.fn();

        const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);

        expect(result.value).toBe("direct-result");
      });

      it("handles various nodetool.input types", () => {
        const inputTypes = [
          "nodetool.input.text",
          "nodetool.input.number",
          "nodetool.input.image",
          "nodetool.input.audio",
          "nodetool.input.file"
        ];

        inputTypes.forEach((type) => {
          const edge = createMockEdge();
          const getResult = jest.fn().mockReturnValue(undefined);
          const findNode = jest.fn().mockReturnValue(
            createMockNode("node1", type, { value: `${type}-value` })
          );

          const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);

          expect(result.isFallback).toBe(true);
          expect(result.value).toBe(`${type}-value`);
        });
      });

      it("handles various nodetool.constant types", () => {
        const constantTypes = [
          "nodetool.constant.string",
          "nodetool.constant.number",
          "nodetool.constant.boolean"
        ];

        constantTypes.forEach((type) => {
          const edge = createMockEdge();
          const getResult = jest.fn().mockReturnValue(undefined);
          const findNode = jest.fn().mockReturnValue(
            createMockNode("node1", type, {}, { value: `${type}-fallback` })
          );

          const result = resolveExternalEdgeValue(edge, "workflow1", getResult, findNode);

          expect(result.isFallback).toBe(true);
          expect(result.value).toBe(`${type}-fallback`);
        });
      });
    });
  });
});
