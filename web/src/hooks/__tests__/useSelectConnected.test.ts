import { renderHook, act } from "@testing-library/react";
import { useSelectConnected } from "../useSelectConnected";
import { useNodes } from "../../contexts/NodeContext";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";

jest.mock("../../contexts/NodeContext", () => ({
  useNodes: jest.fn()
}));

const mockUseNodes = useNodes as jest.MockedFunction<typeof useNodes>;

const createMockNodeData = (): NodeData => ({
  properties: {},
  selectable: true,
  dynamic_properties: {},
  workflow_id: "test-workflow"
});

describe("useSelectConnected", () => {
  const mockNodes: Node<NodeData>[] = [
    {
      id: "input-node",
      type: "input",
      position: { x: 0, y: 0 },
      data: createMockNodeData()
    },
    {
      id: "process-node-1",
      type: "process",
      position: { x: 100, y: 0 },
      data: createMockNodeData()
    },
    {
      id: "process-node-2",
      type: "process",
      position: { x: 200, y: 0 },
      data: createMockNodeData()
    },
    {
      id: "output-node",
      type: "output",
      position: { x: 300, y: 0 },
      data: createMockNodeData()
    }
  ];

  const mockEdges: Edge[] = [
    { id: "e1", source: "input-node", target: "process-node-1", sourceHandle: null, targetHandle: null },
    { id: "e2", source: "process-node-1", target: "process-node-2", sourceHandle: null, targetHandle: null },
    { id: "e3", source: "process-node-2", target: "output-node", sourceHandle: null, targetHandle: null }
  ];

  const createMockSetSelectedNodes = () => jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("direction: both", () => {
    it("should select all connected nodes when direction is 'both'", () => {
      const setSelectedNodes = createMockSetSelectedNodes();

      mockUseNodes.mockReturnValue({
        nodes: mockNodes,
        edges: mockEdges,
        getSelectedNodes: () => [mockNodes[1]],
        setSelectedNodes
      });

      const { result } = renderHook(() => useSelectConnected({ direction: "both" }));

      expect(result.current.connectedNodeCount).toBe(3);
      expect(result.current.getConnectedNodeIds()).toEqual([
        "input-node",
        "process-node-2",
        "output-node"
      ]);
    });

    it("should select connected nodes when multiple nodes are selected", () => {
      const setSelectedNodes = createMockSetSelectedNodes();

      mockUseNodes.mockReturnValue({
        nodes: mockNodes,
        edges: mockEdges,
        getSelectedNodes: () => [mockNodes[1], mockNodes[2]],
        setSelectedNodes
      });

      const { result } = renderHook(() => useSelectConnected({ direction: "both" }));

      expect(result.current.connectedNodeCount).toBe(2);
      const connectedIds = result.current.getConnectedNodeIds();
      expect(connectedIds).toContain("input-node");
      expect(connectedIds).toContain("output-node");
    });

    it("should call setSelectedNodes with all connected nodes", () => {
      const setSelectedNodes = createMockSetSelectedNodes();

      mockUseNodes.mockReturnValue({
        nodes: mockNodes,
        edges: mockEdges,
        getSelectedNodes: () => [mockNodes[1]],
        setSelectedNodes
      });

      const { result } = renderHook(() => useSelectConnected({ direction: "both" }));

      act(() => {
        result.current.selectConnected();
      });

      expect(setSelectedNodes).toHaveBeenCalledTimes(1);
      const calledWith = setSelectedNodes.mock.calls[0][0];
      expect(calledWith.length).toBe(4);
      const calledIds = calledWith.map((n: Node) => n.id);
      expect(calledIds).toContain("process-node-1");
      expect(calledIds).toContain("input-node");
      expect(calledIds).toContain("process-node-2");
      expect(calledIds).toContain("output-node");
    });
  });

  describe("direction: upstream", () => {
    it("should only select upstream nodes when direction is 'upstream'", () => {
      const setSelectedNodes = createMockSetSelectedNodes();

      mockUseNodes.mockReturnValue({
        nodes: mockNodes,
        edges: mockEdges,
        getSelectedNodes: () => [mockNodes[2]],
        setSelectedNodes
      });

      const { result } = renderHook(() => useSelectConnected({ direction: "upstream" }));

      expect(result.current.connectedNodeCount).toBe(2);
      const connectedIds = result.current.getConnectedNodeIds();
      expect(connectedIds).toContain("input-node");
      expect(connectedIds).toContain("process-node-1");
    });

    it("should not include selected nodes in upstream result", () => {
      const setSelectedNodes = createMockSetSelectedNodes();

      mockUseNodes.mockReturnValue({
        nodes: mockNodes,
        edges: mockEdges,
        getSelectedNodes: () => [mockNodes[0]],
        setSelectedNodes
      });

      const { result } = renderHook(() => useSelectConnected({ direction: "upstream" }));

      expect(result.current.connectedNodeCount).toBe(0);
      expect(result.current.getConnectedNodeIds()).toEqual([]);
    });
  });

  describe("direction: downstream", () => {
    it("should only select downstream nodes when direction is 'downstream'", () => {
      const setSelectedNodes = createMockSetSelectedNodes();

      mockUseNodes.mockReturnValue({
        nodes: mockNodes,
        edges: mockEdges,
        getSelectedNodes: () => [mockNodes[1]],
        setSelectedNodes
      });

      const { result } = renderHook(() => useSelectConnected({ direction: "downstream" }));

      expect(result.current.connectedNodeCount).toBe(2);
      expect(result.current.getConnectedNodeIds()).toEqual([
        "process-node-2",
        "output-node"
      ]);
    });

    it("should not include selected nodes in downstream result", () => {
      const setSelectedNodes = createMockSetSelectedNodes();

      mockUseNodes.mockReturnValue({
        nodes: mockNodes,
        edges: mockEdges,
        getSelectedNodes: () => [mockNodes[3]],
        setSelectedNodes
      });

      const { result } = renderHook(() => useSelectConnected({ direction: "downstream" }));

      expect(result.current.connectedNodeCount).toBe(0);
      expect(result.current.getConnectedNodeIds()).toEqual([]);
    });
  });

  describe("empty selection", () => {
    it("should return empty array when no nodes are selected", () => {
      const setSelectedNodes = createMockSetSelectedNodes();

      mockUseNodes.mockReturnValue({
        nodes: mockNodes,
        edges: mockEdges,
        getSelectedNodes: () => [],
        setSelectedNodes
      });

      const { result } = renderHook(() => useSelectConnected({ direction: "both" }));

      expect(result.current.connectedNodeCount).toBe(0);
      expect(result.current.getConnectedNodeIds()).toEqual([]);
    });

    it("should not call setSelectedNodes when no nodes are selected", () => {
      const setSelectedNodes = createMockSetSelectedNodes();

      mockUseNodes.mockReturnValue({
        nodes: mockNodes,
        edges: mockEdges,
        getSelectedNodes: () => [],
        setSelectedNodes
      });

      const { result } = renderHook(() => useSelectConnected({ direction: "both" }));

      act(() => {
        result.current.selectConnected();
      });

      expect(setSelectedNodes).not.toHaveBeenCalled();
    });
  });

  describe("default direction", () => {
    it("should default to 'both' direction", () => {
      const setSelectedNodes = createMockSetSelectedNodes();

      mockUseNodes.mockReturnValue({
        nodes: mockNodes,
        edges: mockEdges,
        getSelectedNodes: () => [mockNodes[1]],
        setSelectedNodes
      });

      const { result } = renderHook(() => useSelectConnected());

      expect(result.current.connectedNodeCount).toBe(3);
    });
  });

  describe("complex graph with branches", () => {
    it("should traverse the entire connected graph", () => {
      const branchedNodes: Node<NodeData>[] = [
        { id: "root", type: "input", position: { x: 0, y: 0 }, data: createMockNodeData() },
        { id: "branch-a", type: "process", position: { x: 100, y: 0 }, data: createMockNodeData() },
        { id: "branch-b", type: "process", position: { x: 100, y: 100 }, data: createMockNodeData() },
        { id: "merged", type: "process", position: { x: 200, y: 50 }, data: createMockNodeData() },
        { id: "output", type: "output", position: { x: 300, y: 50 }, data: createMockNodeData() }
      ];

      const branchedEdges: Edge[] = [
        { id: "e1", source: "root", target: "branch-a", sourceHandle: null, targetHandle: null },
        { id: "e2", source: "root", target: "branch-b", sourceHandle: null, targetHandle: null },
        { id: "e3", source: "branch-a", target: "merged", sourceHandle: null, targetHandle: null },
        { id: "e4", source: "branch-b", target: "merged", sourceHandle: null, targetHandle: null },
        { id: "e5", source: "merged", target: "output", sourceHandle: null, targetHandle: null }
      ];

      const setSelectedNodes = createMockSetSelectedNodes();

      mockUseNodes.mockReturnValue({
        nodes: branchedNodes,
        edges: branchedEdges,
        getSelectedNodes: () => [branchedNodes[0]],
        setSelectedNodes
      });

      const { result } = renderHook(() => useSelectConnected({ direction: "downstream" }));

      expect(result.current.connectedNodeCount).toBe(4);
      const connectedIds = result.current.getConnectedNodeIds();
      expect(connectedIds).toContain("branch-a");
      expect(connectedIds).toContain("branch-b");
      expect(connectedIds).toContain("merged");
      expect(connectedIds).toContain("output");
    });
  });
});
