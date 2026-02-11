import { renderHook } from "@testing-library/react";
import { useWorkflowStatistics } from "../useWorkflowStatistics";

// Mock the NodeContext
jest.mock("../../contexts/NodeContext", () => ({
  useNodes: jest.fn()
}));

import { useNodes } from "../../contexts/NodeContext";

describe("useWorkflowStatistics", () => {
  const mockGetSelectedNodes = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns statistics for empty workflow", () => {
    (useNodes as jest.Mock).mockImplementation((selector) =>
      selector({
        nodes: [],
        edges: [],
        getSelectedNodes: mockGetSelectedNodes.mockReturnValue([])
      })
    );

    const { result } = renderHook(() => useWorkflowStatistics());
    
    expect(result.current.stats.totalNodes).toBe(0);
    expect(result.current.stats.totalEdges).toBe(0);
    expect(result.current.stats.selectedNodes).toBe(0);
    expect(result.current.stats.nodeTypeStats).toEqual([]);
    expect(result.current.stats.hasLoops).toBe(false);
    expect(result.current.stats.hasBypassedNodes).toBe(false);
    expect(result.current.stats.estimatedComplexity).toBe("simple");
  });

  it("calculates correct node and edge counts", () => {
    (useNodes as jest.Mock).mockImplementation((selector) =>
      selector({
        nodes: [
          { id: "1", type: "nodetool.input.StringInput", position: { x: 0, y: 0 } },
          { id: "2", type: "nodetool.image.CreateImage", position: { x: 100, y: 0 } }
        ],
        edges: [
          { id: "e1-2", source: "1", target: "2" }
        ],
        getSelectedNodes: mockGetSelectedNodes.mockReturnValue([])
      })
    );

    const { result } = renderHook(() => useWorkflowStatistics());
    
    expect(result.current.stats.totalNodes).toBe(2);
    expect(result.current.stats.totalEdges).toBe(1);
  });

  it("categorizes node types correctly", () => {
    (useNodes as jest.Mock).mockImplementation((selector) =>
      selector({
        nodes: [
          { id: "1", type: "nodetool.input.StringInput", position: { x: 0, y: 0 } },
          { id: "2", type: "nodetool.output.TextOutput", position: { x: 100, y: 0 } },
          { id: "3", type: "nodetool.constant.StringConstant", position: { x: 200, y: 0 } },
          { id: "4", type: "nodetool.image.CreateImage", position: { x: 300, y: 0 } }
        ],
        edges: [],
        getSelectedNodes: mockGetSelectedNodes.mockReturnValue([])
      })
    );

    const { result } = renderHook(() => useWorkflowStatistics());
    
    const typeStats = result.current.stats.nodeTypeStats;
    expect(typeStats).toHaveLength(4);
    
    const inputStat = typeStats.find(s => s.category === "input");
    expect(inputStat?.count).toBe(1);
    
    const outputStat = typeStats.find(s => s.category === "output");
    expect(outputStat?.count).toBe(1);
    
    const constantStat = typeStats.find(s => s.category === "constant");
    expect(constantStat?.count).toBe(1);
    
    const processingStat = typeStats.find(s => s.category === "processing");
    expect(processingStat?.count).toBe(1);
  });

  it("detects loop nodes", () => {
    (useNodes as jest.Mock).mockImplementation((selector) =>
      selector({
        nodes: [
          { id: "1", type: "nodetool.group.Loop", position: { x: 0, y: 0 } }
        ],
        edges: [],
        getSelectedNodes: mockGetSelectedNodes.mockReturnValue([])
      })
    );

    const { result } = renderHook(() => useWorkflowStatistics());
    
    expect(result.current.stats.hasLoops).toBe(true);
  });

  it("detects bypassed nodes", () => {
    (useNodes as jest.Mock).mockImplementation((selector) =>
      selector({
        nodes: [
          { id: "1", type: "nodetool.image.CreateImage", position: { x: 0, y: 0 }, data: { bypassed: true } }
        ],
        edges: [],
        getSelectedNodes: mockGetSelectedNodes.mockReturnValue([])
      })
    );

    const { result } = renderHook(() => useWorkflowStatistics());
    
    expect(result.current.stats.hasBypassedNodes).toBe(true);
  });

  it("estimates complexity as simple for small workflows", () => {
    (useNodes as jest.Mock).mockImplementation((selector) =>
      selector({
        nodes: [
          { id: "1", type: "nodetool.input.StringInput", position: { x: 0, y: 0 } }
        ],
        edges: [],
        getSelectedNodes: mockGetSelectedNodes.mockReturnValue([])
      })
    );

    const { result } = renderHook(() => useWorkflowStatistics());
    
    expect(result.current.stats.estimatedComplexity).toBe("simple");
  });

  it("estimates complexity as complex for large workflows", () => {
    const nodes = Array.from({ length: 60 }, (_, i) => ({
      id: `${i}`,
      type: "nodetool.image.CreateImage",
      position: { x: i * 100, y: 0 }
    }));

    (useNodes as jest.Mock).mockImplementation((selector) =>
      selector({
        nodes,
        edges: [],
        getSelectedNodes: mockGetSelectedNodes.mockReturnValue([])
      })
    );

    const { result } = renderHook(() => useWorkflowStatistics());
    
    expect(result.current.stats.estimatedComplexity).toBe("complex");
  });

  it("estimates complexity as moderate for medium workflows", () => {
    const nodes = Array.from({ length: 25 }, (_, i) => ({
      id: `${i}`,
      type: "nodetool.image.CreateImage",
      position: { x: i * 100, y: 0 }
    }));

    (useNodes as jest.Mock).mockImplementation((selector) =>
      selector({
        nodes,
        edges: [],
        getSelectedNodes: mockGetSelectedNodes.mockReturnValue([])
      })
    );

    const { result } = renderHook(() => useWorkflowStatistics());
    
    expect(result.current.stats.estimatedComplexity).toBe("moderate");
  });

  it("provides refresh function", () => {
    (useNodes as jest.Mock).mockImplementation((selector) =>
      selector({
        nodes: [],
        edges: [],
        getSelectedNodes: mockGetSelectedNodes.mockReturnValue([])
      })
    );

    const { result } = renderHook(() => useWorkflowStatistics());
    
    expect(typeof result.current.refresh).toBe("function");
    // Calling refresh should not throw
    result.current.refresh();
  });
});
