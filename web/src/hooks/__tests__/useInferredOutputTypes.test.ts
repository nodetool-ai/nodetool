import { renderHook } from "@testing-library/react";
import { useInferredOutputSchema, useInferredOutputType, useInferredOutputTypes, useHasTypedOutputs, useTypedWorkflowOutputs } from "../useInferredOutputTypes";
import { Graph } from "../../stores/ApiTypes";
import * as workflowOutputTypeInference from "../../utils/workflowOutputTypeInference";

jest.mock("../../utils/workflowOutputTypeInference", () => ({
  inferWorkflowOutputSchema: jest.fn()
}));

describe("useInferredOutputTypes", () => {
  const mockGraph: Graph = {
    nodes: [
      { id: "node1", type: "input", data: {}, sync_mode: "regular" },
      { id: "node2", type: "output", data: {}, sync_mode: "regular" }
    ],
    edges: [
      { id: "edge1", source: "node1", target: "node2", sourceHandle: "output", targetHandle: "value" }
    ]
  };

  const mockSchema = {
    type: "object" as const,
    properties: {
      result: {
        name: "result",
        type: "string",
        optional: false,
        stream: false
      }
    },
    required: ["result"]
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("useInferredOutputSchema", () => {
    it("returns undefined for null graph", () => {
      const { result } = renderHook(() => useInferredOutputSchema(null));
      expect(result.current).toBeUndefined();
    });

    it("returns undefined for undefined graph", () => {
      const { result } = renderHook(() => useInferredOutputSchema(undefined));
      expect(result.current).toBeUndefined();
    });

    it("returns undefined for empty graph (no nodes)", () => {
      const emptyGraph: Graph = { nodes: [], edges: [] };
      const { result } = renderHook(() => useInferredOutputSchema(emptyGraph));
      expect(result.current).toBeUndefined();
    });

    it("returns inferred schema for valid graph", () => {
      (workflowOutputTypeInference.inferWorkflowOutputSchema as jest.Mock).mockReturnValue(mockSchema);

      const { result } = renderHook(() => useInferredOutputSchema(mockGraph));
      expect(result.current).toEqual(mockSchema);
    });

    it("memoizes result based on graph reference", () => {
      (workflowOutputTypeInference.inferWorkflowOutputSchema as jest.Mock).mockReturnValue(mockSchema);

      const { result, rerender } = renderHook(() => useInferredOutputSchema(mockGraph));
      const firstResult = result.current;

      rerender();
      expect(result.current).toBe(firstResult);
    });
  });

  describe("useInferredOutputType", () => {
    it("returns undefined when schema is undefined", () => {
      (workflowOutputTypeInference.inferWorkflowOutputSchema as jest.Mock).mockReturnValue(undefined);

      const { result } = renderHook(() => useInferredOutputType(mockGraph, "result"));
      expect(result.current).toBeUndefined();
    });

    it("returns undefined when output name not found in schema", () => {
      (workflowOutputTypeInference.inferWorkflowOutputSchema as jest.Mock).mockReturnValue(mockSchema);

      const { result } = renderHook(() => useInferredOutputType(mockGraph, "nonexistent"));
      expect(result.current).toBeUndefined();
    });

    it("returns correct output type when found", () => {
      (workflowOutputTypeInference.inferWorkflowOutputSchema as jest.Mock).mockReturnValue(mockSchema);

      const { result } = renderHook(() => useInferredOutputType(mockGraph, "result"));
      expect(result.current).toEqual({
        name: "result",
        type: "string",
        optional: false,
        stream: false
      });
    });
  });

  describe("useInferredOutputTypes", () => {
    it("returns empty array when schema is undefined", () => {
      (workflowOutputTypeInference.inferWorkflowOutputSchema as jest.Mock).mockReturnValue(undefined);

      const { result } = renderHook(() => useInferredOutputTypes(mockGraph));
      expect(result.current).toEqual([]);
    });

    it("returns array of output types", () => {
      (workflowOutputTypeInference.inferWorkflowOutputSchema as jest.Mock).mockReturnValue(mockSchema);

      const { result } = renderHook(() => useInferredOutputTypes(mockGraph));
      expect(result.current).toHaveLength(1);
      expect(result.current[0].name).toBe("result");
    });
  });

  describe("useHasTypedOutputs", () => {
    it("returns false when schema is undefined", () => {
      (workflowOutputTypeInference.inferWorkflowOutputSchema as jest.Mock).mockReturnValue(undefined);

      const { result } = renderHook(() => useHasTypedOutputs(mockGraph));
      expect(result.current).toBe(false);
    });

    it("returns false when schema has no properties", () => {
      (workflowOutputTypeInference.inferWorkflowOutputSchema as jest.Mock).mockReturnValue({
        type: "object",
        properties: {},
        required: []
      });

      const { result } = renderHook(() => useHasTypedOutputs(mockGraph));
      expect(result.current).toBe(false);
    });

    it("returns true when schema has properties", () => {
      (workflowOutputTypeInference.inferWorkflowOutputSchema as jest.Mock).mockReturnValue(mockSchema);

      const { result } = renderHook(() => useHasTypedOutputs(mockGraph));
      expect(result.current).toBe(true);
    });
  });

  describe("useTypedWorkflowOutputs", () => {
    it("returns correct shape for valid graph", () => {
      (workflowOutputTypeInference.inferWorkflowOutputSchema as jest.Mock).mockReturnValue(mockSchema);

      const { result } = renderHook(() => useTypedWorkflowOutputs(mockGraph));

      expect(result.current.schema).toEqual(mockSchema);
      expect(result.current.hasTypedOutputs).toBe(true);
      expect(result.current.outputTypes).toHaveLength(1);
      expect(typeof result.current.getOutputType).toBe("function");
      expect(typeof result.current.isRequired).toBe("function");
    });

    it("getOutputType returns correct type", () => {
      (workflowOutputTypeInference.inferWorkflowOutputSchema as jest.Mock).mockReturnValue(mockSchema);

      const { result } = renderHook(() => useTypedWorkflowOutputs(mockGraph));

      const outputType = result.current.getOutputType("result");
      expect(outputType).toEqual({
        name: "result",
        type: "string",
        optional: false,
        stream: false
      });
    });

    it("getOutputType returns undefined for unknown output", () => {
      (workflowOutputTypeInference.inferWorkflowOutputSchema as jest.Mock).mockReturnValue(mockSchema);

      const { result } = renderHook(() => useTypedWorkflowOutputs(mockGraph));

      const outputType = result.current.getOutputType("unknown");
      expect(outputType).toBeUndefined();
    });

    it("isRequired returns true for required output", () => {
      (workflowOutputTypeInference.inferWorkflowOutputSchema as jest.Mock).mockReturnValue(mockSchema);

      const { result } = renderHook(() => useTypedWorkflowOutputs(mockGraph));

      expect(result.current.isRequired("result")).toBe(true);
    });

    it("isRequired returns false for optional output", () => {
      (workflowOutputTypeInference.inferWorkflowOutputSchema as jest.Mock).mockReturnValue({
        type: "object",
        properties: {
          optionalResult: {
            name: "optionalResult",
            type: "string",
            optional: true,
            stream: false
          }
        },
        required: []
      });

      const { result } = renderHook(() => useTypedWorkflowOutputs(mockGraph));

      expect(result.current.isRequired("optionalResult")).toBe(false);
    });

    it("returns undefined schema when graph is null", () => {
      const { result } = renderHook(() => useTypedWorkflowOutputs(null));

      expect(result.current.schema).toBeUndefined();
      expect(result.current.hasTypedOutputs).toBe(false);
      expect(result.current.outputTypes).toEqual([]);
    });
  });
});
