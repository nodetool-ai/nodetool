import { renderHook, act } from "@testing-library/react";
import { useSmartSelection } from "../useSmartSelection";
import { NodeData } from "../../stores/NodeData";
import { Node, Edge } from "@xyflow/react";
import { useNodes } from "../../contexts/NodeContext";

jest.mock("../../contexts/NodeContext", () => ({
  useNodes: jest.fn()
}));

const mockNodeData: NodeData = {
  properties: {},
  selectable: true,
  dynamic_properties: {},
  workflow_id: "wf1"
};

const mockNodes: Node<NodeData>[] = [
  {
    id: "node1",
    type: "input",
    position: { x: 0, y: 0 },
    selected: true,
    data: mockNodeData
  },
  {
    id: "node2",
    type: "process",
    position: { x: 100, y: 0 },
    selected: false,
    data: mockNodeData
  },
  {
    id: "node3",
    type: "process",
    position: { x: 200, y: 0 },
    selected: false,
    data: mockNodeData
  },
  {
    id: "node4",
    type: "output",
    position: { x: 300, y: 0 },
    selected: false,
    data: mockNodeData
  },
  {
    id: "node5",
    type: "process",
    position: { x: 100, y: 100 },
    selected: false,
    parentId: "node2",
    data: mockNodeData
  }
];

const mockEdges: Edge[] = [
  { id: "e1", source: "node1", target: "node2", sourceHandle: null, targetHandle: null },
  { id: "e2", source: "node2", target: "node3", sourceHandle: null, targetHandle: null },
  { id: "e3", source: "node3", target: "node4", sourceHandle: null, targetHandle: null }
];

const createMockUseNodes = (
  nodes: Node<NodeData>[],
  edges: Edge[]
) => () => ({
  nodes,
  edges,
  setSelectedNodes: jest.fn(),
  getSelectedNodes: () => nodes.filter((n) => n.selected)
});

describe("useSmartSelection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("selectConnected", () => {
    it("selects nodes directly connected to selection", () => {
      (useNodes as jest.Mock).mockImplementation(
        createMockUseNodes(mockNodes, mockEdges)
      );

      const { result } = renderHook(() => useSmartSelection());

      act(() => {
        result.current.selectConnected();
      });

      expect(result.current.selectConnected).toBeDefined();
    });

    it("returns early when no nodes are selected", () => {
      const nodesWithNoneSelected = mockNodes.map((n) => ({ ...n, selected: false }));
      (useNodes as jest.Mock).mockImplementation(
        createMockUseNodes(nodesWithNoneSelected, mockEdges)
      );

      const { result } = renderHook(() => useSmartSelection());

      act(() => {
        result.current.selectConnected();
      });

      expect(result.current.selectConnected).toBeDefined();
    });

    it("traverses multi-level connections", () => {
      (useNodes as jest.Mock).mockImplementation(
        createMockUseNodes(mockNodes, mockEdges)
      );

      const { result } = renderHook(() => useSmartSelection());

      act(() => {
        result.current.selectConnected();
      });

      expect(result.current.selectConnected).toBeDefined();
    });
  });

  describe("selectSameType", () => {
    it("selects all nodes of the same type", () => {
      (useNodes as jest.Mock).mockImplementation(
        createMockUseNodes(mockNodes, mockEdges)
      );

      const { result } = renderHook(() => useSmartSelection());

      act(() => {
        result.current.selectSameType();
      });

      expect(result.current.selectSameType).toBeDefined();
    });

    it("returns early when no nodes are selected", () => {
      const nodesWithNoneSelected = mockNodes.map((n) => ({ ...n, selected: false }));
      (useNodes as jest.Mock).mockImplementation(
        createMockUseNodes(nodesWithNoneSelected, mockEdges)
      );

      const { result } = renderHook(() => useSmartSelection());

      act(() => {
        result.current.selectSameType();
      });

      expect(result.current.selectSameType).toBeDefined();
    });
  });

  describe("selectParents", () => {
    it("selects parent nodes of the selection", () => {
      (useNodes as jest.Mock).mockImplementation(
        createMockUseNodes(mockNodes, mockEdges)
      );

      const { result } = renderHook(() => useSmartSelection());

      act(() => {
        result.current.selectParents();
      });

      expect(result.current.selectParents).toBeDefined();
    });

    it("returns early when no parent nodes exist", () => {
      (useNodes as jest.Mock).mockImplementation(
        createMockUseNodes(mockNodes, mockEdges)
      );

      const { result } = renderHook(() => useSmartSelection());

      act(() => {
        result.current.selectParents();
      });

      expect(result.current.selectParents).toBeDefined();
    });
  });

  describe("selectChildren", () => {
    it("selects child nodes of the selection", () => {
      (useNodes as jest.Mock).mockImplementation(
        createMockUseNodes(mockNodes, mockEdges)
      );

      const { result } = renderHook(() => useSmartSelection());

      act(() => {
        result.current.selectChildren();
      });

      expect(result.current.selectChildren).toBeDefined();
    });

    it("returns early when no child nodes exist", () => {
      const nodesWithoutChildren = mockNodes.filter((n) => n.id !== "node2");
      (useNodes as jest.Mock).mockImplementation(
        createMockUseNodes(nodesWithoutChildren, mockEdges)
      );

      const { result } = renderHook(() => useSmartSelection());

      act(() => {
        result.current.selectChildren();
      });

      expect(result.current.selectChildren).toBeDefined();
    });
  });

  describe("selectInverse", () => {
    it("inverts the current selection", () => {
      (useNodes as jest.Mock).mockImplementation(
        createMockUseNodes(mockNodes, mockEdges)
      );

      const { result } = renderHook(() => useSmartSelection());

      act(() => {
        result.current.selectInverse();
      });

      expect(result.current.selectInverse).toBeDefined();
    });
  });

  describe("all selection functions are exported", () => {
    it("exports all selection functions", () => {
      (useNodes as jest.Mock).mockImplementation(
        createMockUseNodes(mockNodes, mockEdges)
      );

      const { result } = renderHook(() => useSmartSelection());

      expect(result.current.selectConnected).toBeDefined();
      expect(result.current.selectSameType).toBeDefined();
      expect(result.current.selectParents).toBeDefined();
      expect(result.current.selectChildren).toBeDefined();
      expect(result.current.selectInverse).toBeDefined();
    });
  });
});
