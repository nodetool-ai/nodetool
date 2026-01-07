import { renderHook } from "@testing-library/react";
import { useWorkflowStats } from "../useWorkflowStats";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "../../../stores/NodeData";

const createMockNode = (
  id: string,
  type: string,
  position: { x: number; y: number } = { x: 0, y: 0 }
): Node<NodeData> => ({
  id,
  type,
  position,
  data: {
    title: type,
    properties: {},
    selectable: true,
    dynamic_properties: {},
    workflow_id: "test-workflow"
  },
  width: 280,
  height: 100
});

const createMockEdge = (id: string, source: string, target: string): Edge => ({
  id,
  source,
  target,
  sourceHandle: "output",
  targetHandle: "input"
});

describe("useWorkflowStats", () => {
  it("returns zeros for empty workflow", () => {
    const { result } = renderHook(() =>
      useWorkflowStats([], [])
    );

    expect(result.current.totalNodes).toBe(0);
    expect(result.current.totalEdges).toBe(0);
    expect(result.current.complexityScore).toBe(0);
    expect(result.current.isolatedNodes).toBe(0);
    expect(result.current.rootNodes).toBe(0);
    expect(result.current.leafNodes).toBe(0);
  });

  it("calculates node and edge counts correctly", () => {
    const nodes = [
      createMockNode("1", "nodetool.input.StringInput"),
      createMockNode("2", "nodetool.process.LLM"),
      createMockNode("3", "nodetool.output.TextOutput")
    ];
    const edges = [
      createMockEdge("e1", "1", "2"),
      createMockEdge("e2", "2", "3")
    ];

    const { result } = renderHook(() => useWorkflowStats(nodes, edges));

    expect(result.current.totalNodes).toBe(3);
    expect(result.current.totalEdges).toBe(2);
  });

  it("identifies root nodes correctly", () => {
    const nodes = [
      createMockNode("1", "nodetool.input.StringInput"),
      createMockNode("2", "nodetool.process.LLM"),
      createMockNode("3", "nodetool.output.TextOutput")
    ];
    const edges = [
      createMockEdge("e1", "1", "2"),
      createMockEdge("e2", "2", "3")
    ];

    const { result } = renderHook(() => useWorkflowStats(nodes, edges));

    expect(result.current.rootNodes).toBe(1);
    expect(result.current.leafNodes).toBe(1);
  });

  it("identifies isolated nodes correctly", () => {
    const nodes = [
      createMockNode("1", "nodetool.input.StringInput"),
      createMockNode("2", "nodetool.process.LLM"),
      createMockNode("3", "nodetool.output.TextOutput"),
      createMockNode("4", "nodetool.input.ImageInput")
    ];
    const edges = [
      createMockEdge("e1", "1", "2"),
      createMockEdge("e2", "2", "3")
    ];

    const { result } = renderHook(() => useWorkflowStats(nodes, edges));

    expect(result.current.isolatedNodes).toBe(1);
  });

  it("counts nodes by type correctly", () => {
    const nodes = [
      createMockNode("1", "nodetool.input.StringInput"),
      createMockNode("2", "nodetool.input.StringInput"),
      createMockNode("3", "nodetool.process.LLM"),
      createMockNode("4", "nodetool.output.TextOutput")
    ];

    const { result } = renderHook(() => useWorkflowStats(nodes, []));

    expect(result.current.nodeCountByType["nodetool.input.StringInput"]).toBe(2);
    expect(result.current.nodeCountByType["nodetool.process.LLM"]).toBe(1);
    expect(result.current.nodeCountByType["nodetool.output.TextOutput"]).toBe(1);
  });

  it("counts nodes by namespace correctly", () => {
    const nodes = [
      createMockNode("1", "nodetool.input.StringInput"),
      createMockNode("2", "math.operations.Add"),
      createMockNode("3", "math.operations.Subtract"),
      createMockNode("4", "text.processors.Uppercase")
    ];

    const { result } = renderHook(() => useWorkflowStats(nodes, []));

    expect(result.current.nodeCountByNamespace["nodetool.input"]).toBe(1);
    expect(result.current.nodeCountByNamespace["math.operations"]).toBe(2);
    expect(result.current.nodeCountByNamespace["text.processors"]).toBe(1);
    expect(result.current.nodeCountByNamespace["default"]).toBeUndefined();
  });

  it("calculates complexity score", () => {
    const nodes = [
      createMockNode("1", "nodetool.input.StringInput"),
      createMockNode("2", "nodetool.process.LLM"),
      createMockNode("3", "nodetool.output.TextOutput")
    ];
    const edges = [
      createMockEdge("e1", "1", "2"),
      createMockEdge("e2", "2", "3")
    ];

    const { result } = renderHook(() => useWorkflowStats(nodes, edges));

    expect(result.current.complexityScore).toBeGreaterThan(0);
    expect(typeof result.current.complexityScore).toBe("number");
  });

  it("calculates connection density", () => {
    const nodes = [
      createMockNode("1", "nodetool.input.StringInput"),
      createMockNode("2", "nodetool.process.LLM"),
      createMockNode("3", "nodetool.output.TextOutput")
    ];
    const edges = [
      createMockEdge("e1", "1", "2"),
      createMockEdge("e2", "2", "3")
    ];

    const { result } = renderHook(() => useWorkflowStats(nodes, edges));

    expect(result.current.connectionDensity).toBeGreaterThan(0);
    expect(result.current.connectionDensity).toBeLessThan(100);
  });

  it("handles complex workflow with multiple connections", () => {
    const nodes = [
      createMockNode("1", "nodetool.input.StringInput"),
      createMockNode("2", "nodetool.input.ImageInput"),
      createMockNode("3", "nodetool.process.LLM"),
      createMockNode("4", "nodetool.process.ImageProcessor"),
      createMockNode("5", "nodetool.output.CombinedOutput")
    ];
    const edges = [
      createMockEdge("e1", "1", "3"),
      createMockEdge("e2", "2", "3"),
      createMockEdge("e3", "2", "4"),
      createMockEdge("e4", "3", "5"),
      createMockEdge("e5", "4", "5")
    ];

    const { result } = renderHook(() => useWorkflowStats(nodes, edges));

    expect(result.current.totalNodes).toBe(5);
    expect(result.current.totalEdges).toBe(5);
    expect(result.current.rootNodes).toBe(2);
    expect(result.current.leafNodes).toBe(1);
  });
});
