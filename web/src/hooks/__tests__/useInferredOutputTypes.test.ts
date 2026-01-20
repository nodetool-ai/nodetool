import { renderHook } from "@testing-library/react";
import { 
  useInferredOutputSchema, 
  useInferredOutputType, 
  useInferredOutputTypes,
  useHasTypedOutputs,
  useTypedWorkflowOutputs
} from "../useInferredOutputTypes";
import { Graph } from "../../stores/ApiTypes";
import { InferredOutputSchema } from "../../utils/workflowOutputTypeInference";

jest.mock("../../utils/workflowOutputTypeInference", () => ({
  inferWorkflowOutputSchema: jest.fn()
}));

import { inferWorkflowOutputSchema } from "../../utils/workflowOutputTypeInference";

describe("useInferredOutputTypes", () => {
  const mockGraph: Graph = {
    nodes: [
      { id: "node-1", type: "test", data: {}, sync_mode: "on_any" }
    ],
    edges: []
  };

  const mockSchema: InferredOutputSchema = {
    type: "object",
    properties: {
      result: {
        name: "result",
        type: "str",
        optional: false,
        stream: false
      },
      confidence: {
        name: "confidence",
        type: "float",
        optional: true,
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
      (inferWorkflowOutputSchema as jest.Mock).mockReturnValue(undefined);
      
      const { result } = renderHook(() => useInferredOutputSchema(null));
      
      expect(result.current).toBeUndefined();
    });

    it("returns undefined for undefined graph", () => {
      (inferWorkflowOutputSchema as jest.Mock).mockReturnValue(undefined);
      
      const { result } = renderHook(() => useInferredOutputSchema(undefined));
      
      expect(result.current).toBeUndefined();
    });

    it("returns schema for valid graph", () => {
      (inferWorkflowOutputSchema as jest.Mock).mockReturnValue(mockSchema);
      
      const { result } = renderHook(() => useInferredOutputSchema(mockGraph));
      
      expect(result.current).toEqual(mockSchema);
      expect(inferWorkflowOutputSchema).toHaveBeenCalledWith(mockGraph);
    });

    it("memoizes result for same graph", () => {
      (inferWorkflowOutputSchema as jest.Mock).mockReturnValue(mockSchema);
      
      const { rerender } = renderHook(() => useInferredOutputSchema(mockGraph));
      rerender();
      rerender();
      
      expect(inferWorkflowOutputSchema).toHaveBeenCalledTimes(1);
    });
  });

  describe("useInferredOutputType", () => {
    it("returns undefined when schema is not available", () => {
      (inferWorkflowOutputSchema as jest.Mock).mockReturnValue(undefined);
      
      const { result } = renderHook(() => 
        useInferredOutputType(mockGraph, "result")
      );
      
      expect(result.current).toBeUndefined();
    });

    it("returns undefined for non-existent output", () => {
      (inferWorkflowOutputSchema as jest.Mock).mockReturnValue(mockSchema);
      
      const { result } = renderHook(() => 
        useInferredOutputType(mockGraph, "nonexistent")
      );
      
      expect(result.current).toBeUndefined();
    });

    it("returns output type for existing output", () => {
      (inferWorkflowOutputSchema as jest.Mock).mockReturnValue(mockSchema);
      
      const { result } = renderHook(() => 
        useInferredOutputType(mockGraph, "result")
      );
      
      expect(result.current).toEqual({
        name: "result",
        type: "str",
        optional: false,
        stream: false
      });
    });

    it("returns optional output type", () => {
      (inferWorkflowOutputSchema as jest.Mock).mockReturnValue(mockSchema);
      
      const { result } = renderHook(() => 
        useInferredOutputType(mockGraph, "confidence")
      );
      
      expect(result.current).toEqual({
        name: "confidence",
        type: "float",
        optional: true,
        stream: false
      });
    });
  });

  describe("useInferredOutputTypes", () => {
    it("returns empty array when schema is not available", () => {
      (inferWorkflowOutputSchema as jest.Mock).mockReturnValue(undefined);
      
      const { result } = renderHook(() => useInferredOutputTypes(mockGraph));
      
      expect(result.current).toEqual([]);
    });

    it("returns array of output types", () => {
      (inferWorkflowOutputSchema as jest.Mock).mockReturnValue(mockSchema);
      
      const { result } = renderHook(() => useInferredOutputTypes(mockGraph));
      
      expect(result.current).toHaveLength(2);
      expect(result.current).toContainEqual({
        name: "result",
        type: "str",
        optional: false,
        stream: false
      });
      expect(result.current).toContainEqual({
        name: "confidence",
        type: "float",
        optional: true,
        stream: false
      });
    });
  });

  describe("useHasTypedOutputs", () => {
    it("returns false when schema is undefined", () => {
      (inferWorkflowOutputSchema as jest.Mock).mockReturnValue(undefined);
      
      const { result } = renderHook(() => useHasTypedOutputs(mockGraph));
      
      expect(result.current).toBe(false);
    });

    it("returns false when schema has no properties", () => {
      (inferWorkflowOutputSchema as jest.Mock).mockReturnValue({
        type: "object",
        properties: {},
        required: []
      });
      
      const { result } = renderHook(() => useHasTypedOutputs(mockGraph));
      
      expect(result.current).toBe(false);
    });

    it("returns true when schema has properties", () => {
      (inferWorkflowOutputSchema as jest.Mock).mockReturnValue(mockSchema);
      
      const { result } = renderHook(() => useHasTypedOutputs(mockGraph));
      
      expect(result.current).toBe(true);
    });
  });

  describe("useTypedWorkflowOutputs", () => {
    it("returns undefined schema for null graph", () => {
      (inferWorkflowOutputSchema as jest.Mock).mockReturnValue(undefined);
      
      const { result } = renderHook(() => useTypedWorkflowOutputs(null));
      
      expect(result.current.schema).toBeUndefined();
      expect(result.current.hasTypedOutputs).toBe(false);
      expect(result.current.outputTypes).toEqual([]);
    });

    it("returns typed schema for valid graph", () => {
      (inferWorkflowOutputSchema as jest.Mock).mockReturnValue(mockSchema);
      
      const { result } = renderHook(() => useTypedWorkflowOutputs(mockGraph));
      
      expect(result.current.schema).toEqual(mockSchema);
      expect(result.current.hasTypedOutputs).toBe(true);
      expect(result.current.outputTypes).toHaveLength(2);
    });

    it("provides getOutputType function", () => {
      (inferWorkflowOutputSchema as jest.Mock).mockReturnValue(mockSchema);
      
      const { result } = renderHook(() => useTypedWorkflowOutputs(mockGraph));
      
      const outputType = result.current.getOutputType("result");
      expect(outputType).toEqual({
        name: "result",
        type: "str",
        optional: false,
        stream: false
      });
    });

    it("getOutputType returns undefined for non-existent output", () => {
      (inferWorkflowOutputSchema as jest.Mock).mockReturnValue(mockSchema);
      
      const { result } = renderHook(() => useTypedWorkflowOutputs(mockGraph));
      
      const outputType = result.current.getOutputType("nonexistent");
      expect(outputType).toBeUndefined();
    });

    it("provides isRequired function", () => {
      (inferWorkflowOutputSchema as jest.Mock).mockReturnValue(mockSchema);
      
      const { result } = renderHook(() => useTypedWorkflowOutputs(mockGraph));
      
      expect(result.current.isRequired("result")).toBe(true);
      expect(result.current.isRequired("confidence")).toBe(false);
    });

    it("isRequired returns false when schema is undefined", () => {
      (inferWorkflowOutputSchema as jest.Mock).mockReturnValue(undefined);
      
      const { result } = renderHook(() => useTypedWorkflowOutputs(mockGraph));
      
      expect(result.current.isRequired("result")).toBe(false);
    });
  });
});
