import { renderHook } from "@testing-library/react";
import {
  useInferredOutputSchema,
  useInferredOutputType,
  useInferredOutputTypes,
  useHasTypedOutputs,
  useTypedWorkflowOutputs
} from "../useInferredOutputTypes";
import { Graph, Node } from "../../stores/ApiTypes";

// Helper to create a test node with required properties
const createTestNode = (
  id: string, 
  type: string, 
  data: Record<string, unknown> = {}
): Node => ({
  id,
  type,
  data,
  parent_id: null,
  ui_properties: { position: [0, 0] },
  sync_mode: "on_any"
});

// Mock the inferWorkflowOutputSchema function
jest.mock("../../utils/workflowOutputTypeInference", () => ({
  inferWorkflowOutputSchema: jest.fn((graph: Graph) => {
    // Find output nodes and infer their types
    const outputNodes = graph.nodes.filter(
      (node) => node.type === "nodetool.workflows.base_node.Output"
    );

    if (outputNodes.length === 0) {
      return undefined;
    }

    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    const nodeData = (data: unknown): Record<string, unknown> => 
      data as Record<string, unknown> ?? {};

    outputNodes.forEach((node) => {
      const data = nodeData(node.data);
      const name = (data.name as string) || "output";
      properties[name] = {
        name,
        type: "string",
        description: data.description
      };
      required.push(name);
    });

    return {
      type: "object",
      properties,
      required
    };
  })
}));

describe("useInferredOutputSchema", () => {
  it("returns undefined for null graph", () => {
    const { result } = renderHook(() => useInferredOutputSchema(null));
    expect(result.current).toBeUndefined();
  });

  it("returns undefined for undefined graph", () => {
    const { result } = renderHook(() => useInferredOutputSchema(undefined));
    expect(result.current).toBeUndefined();
  });

  it("returns undefined for graph with no nodes", () => {
    const { result } = renderHook(() =>
      useInferredOutputSchema({ nodes: [], edges: [] })
    );
    expect(result.current).toBeUndefined();
  });

  it("returns schema for graph with output nodes", () => {
    const graph: Graph = {
      nodes: [
        createTestNode("1", "nodetool.workflows.base_node.Output", { 
          name: "result", 
          description: "The result" 
        })
      ],
      edges: []
    };

    const { result } = renderHook(() => useInferredOutputSchema(graph));

    expect(result.current).toBeDefined();
    expect(result.current?.properties).toHaveProperty("result");
    expect(result.current?.required).toContain("result");
  });

  it("memoizes result for same graph", () => {
    const graph: Graph = {
      nodes: [
        createTestNode("1", "nodetool.workflows.base_node.Output", { name: "result" })
      ],
      edges: []
    };

    const { result, rerender } = renderHook(
      ({ graph }) => useInferredOutputSchema(graph),
      { initialProps: { graph } }
    );

    const firstResult = result.current;
    rerender({ graph });
    const secondResult = result.current;

    expect(firstResult).toBe(secondResult);
  });
});

describe("useInferredOutputType", () => {
  it("returns undefined for null graph", () => {
    const { result } = renderHook(() => useInferredOutputType(null, "result"));
    expect(result.current).toBeUndefined();
  });

  it("returns undefined for unknown output name", () => {
    const graph: Graph = {
      nodes: [
        createTestNode("1", "nodetool.workflows.base_node.Output", { name: "result" })
      ],
      edges: []
    };

    const { result } = renderHook(() =>
      useInferredOutputType(graph, "unknown")
    );
    expect(result.current).toBeUndefined();
  });

  it("returns type for known output name", () => {
    const graph: Graph = {
      nodes: [
        createTestNode("1", "nodetool.workflows.base_node.Output", { name: "result" })
      ],
      edges: []
    };

    const { result } = renderHook(() => useInferredOutputType(graph, "result"));
    expect(result.current).toBeDefined();
    expect(result.current?.name).toBe("result");
  });
});

describe("useInferredOutputTypes", () => {
  it("returns empty array for null graph", () => {
    const { result } = renderHook(() => useInferredOutputTypes(null));
    expect(result.current).toEqual([]);
  });

  it("returns empty array for graph with no outputs", () => {
    const graph: Graph = {
      nodes: [
        createTestNode("1", "nodetool.text.TextNode", {})
      ],
      edges: []
    };

    const { result } = renderHook(() => useInferredOutputTypes(graph));
    expect(result.current).toEqual([]);
  });

  it("returns array of output types", () => {
    const graph: Graph = {
      nodes: [
        createTestNode("1", "nodetool.workflows.base_node.Output", { name: "output1" }),
        createTestNode("2", "nodetool.workflows.base_node.Output", { name: "output2" })
      ],
      edges: []
    };

    const { result } = renderHook(() => useInferredOutputTypes(graph));
    expect(result.current).toHaveLength(2);
    expect(result.current.map((o) => o.name)).toContain("output1");
    expect(result.current.map((o) => o.name)).toContain("output2");
  });
});

describe("useHasTypedOutputs", () => {
  it("returns false for null graph", () => {
    const { result } = renderHook(() => useHasTypedOutputs(null));
    expect(result.current).toBe(false);
  });

  it("returns false for graph with no output nodes", () => {
    const graph: Graph = {
      nodes: [
        createTestNode("1", "nodetool.text.TextNode", {})
      ],
      edges: []
    };

    const { result } = renderHook(() => useHasTypedOutputs(graph));
    expect(result.current).toBe(false);
  });

  it("returns true for graph with output nodes", () => {
    const graph: Graph = {
      nodes: [
        createTestNode("1", "nodetool.workflows.base_node.Output", { name: "result" })
      ],
      edges: []
    };

    const { result } = renderHook(() => useHasTypedOutputs(graph));
    expect(result.current).toBe(true);
  });
});

describe("useTypedWorkflowOutputs", () => {
  it("returns empty state for null graph", () => {
    const { result } = renderHook(() => useTypedWorkflowOutputs(null));

    expect(result.current.schema).toBeUndefined();
    expect(result.current.hasTypedOutputs).toBe(false);
    expect(result.current.outputTypes).toEqual([]);
    expect(result.current.getOutputType("any")).toBeUndefined();
    expect(result.current.isRequired("any")).toBe(false);
  });

  it("returns complete state for graph with outputs", () => {
    const graph: Graph = {
      nodes: [
        createTestNode("1", "nodetool.workflows.base_node.Output", { name: "result" })
      ],
      edges: []
    };

    const { result } = renderHook(() => useTypedWorkflowOutputs(graph));

    expect(result.current.schema).toBeDefined();
    expect(result.current.hasTypedOutputs).toBe(true);
    expect(result.current.outputTypes).toHaveLength(1);
    expect(result.current.getOutputType("result")).toBeDefined();
    expect(result.current.isRequired("result")).toBe(true);
  });

  it("getOutputType returns undefined for unknown name", () => {
    const graph: Graph = {
      nodes: [
        createTestNode("1", "nodetool.workflows.base_node.Output", { name: "result" })
      ],
      edges: []
    };

    const { result } = renderHook(() => useTypedWorkflowOutputs(graph));
    expect(result.current.getOutputType("unknown")).toBeUndefined();
  });

  it("isRequired returns false for unknown name", () => {
    const graph: Graph = {
      nodes: [
        createTestNode("1", "nodetool.workflows.base_node.Output", { name: "result" })
      ],
      edges: []
    };

    const { result } = renderHook(() => useTypedWorkflowOutputs(graph));
    expect(result.current.isRequired("unknown")).toBe(false);
  });
});
