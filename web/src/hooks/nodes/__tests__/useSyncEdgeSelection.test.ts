import { renderHook } from "@testing-library/react";
import { useSyncEdgeSelection } from "../useSyncEdgeSelection";
import { useNodes } from "../../../contexts/NodeContext";
import { Node } from "@xyflow/react";
import { NodeData } from "../../../stores/NodeData";

jest.mock("../../../contexts/NodeContext", () => ({
  useNodes: jest.fn()
}));

const mockGetInputEdges = jest.fn();
const mockGetOutputEdges = jest.fn();
const mockFindNode = jest.fn();
const mockSetEdgeSelectionState = jest.fn();

const createMockNode = (id: string, selected = false): Node<NodeData> => ({
  id,
  type: "default",
  position: { x: 0, y: 0 },
  selected,
  data: {
    properties: {},
    selectable: true,
    dynamic_properties: {},
    workflow_id: "test"
  }
});

describe("useSyncEdgeSelection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useNodes as jest.Mock).mockReturnValue({
      getInputEdges: mockGetInputEdges,
      getOutputEdges: mockGetOutputEdges,
      findNode: mockFindNode,
      setEdgeSelectionState: mockSetEdgeSelectionState
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe("basic functionality", () => {
    it("does not call setEdgeSelectionState when node is not selected and has no connected edges", () => {
      jest.useFakeTimers();
      mockGetInputEdges.mockReturnValue([]);
      mockGetOutputEdges.mockReturnValue([]);

      const { result, unmount } = renderHook(() =>
        useSyncEdgeSelection("node-1", false)
      );

      expect(result.current).toBeUndefined();
      expect(mockSetEdgeSelectionState).not.toHaveBeenCalled();
      unmount();
    });

    it("selects all connected edges when node is selected", () => {
      jest.useFakeTimers();
      mockGetInputEdges.mockReturnValue([
        { id: "edge-1", source: "node-1", target: "node-2", selected: false },
        { id: "edge-2", source: "node-3", target: "node-1", selected: false }
      ]);
      mockGetOutputEdges.mockReturnValue([
        { id: "edge-3", source: "node-1", target: "node-4", selected: false }
      ]);
      mockFindNode.mockImplementation((id: string) => {
        if (["node-2", "node-3", "node-4"].includes(id)) {
          return createMockNode(id, false);
        }
        return null;
      });

      const { unmount } = renderHook(() => useSyncEdgeSelection("node-1", true));
      jest.runAllTimers();

      expect(mockSetEdgeSelectionState).toHaveBeenCalledWith({
        "edge-1": true,
        "edge-2": true,
        "edge-3": true
      });
      unmount();
    });

    it("deselects already selected edges when node is not selected", () => {
      mockGetInputEdges.mockReturnValue([
        { id: "edge-1", source: "node-1", target: "node-2", selected: true }
      ]);
      mockGetOutputEdges.mockReturnValue([]);
      mockFindNode.mockReturnValue(createMockNode("node-2", false));

      renderHook(() => useSyncEdgeSelection("node-1", false));

      expect(mockSetEdgeSelectionState).toHaveBeenCalledWith({
        "edge-1": false
      });
    });
  });

  describe("edge selection updates", () => {
    it("only updates edges that have different selection state", () => {
      mockGetInputEdges.mockReturnValue([
        { id: "edge-1", source: "node-1", target: "node-2", selected: true },
        { id: "edge-2", source: "node-3", target: "node-1", selected: false }
      ]);
      mockGetOutputEdges.mockReturnValue([
        { id: "edge-3", source: "node-1", target: "node-4", selected: false }
      ]);
      mockFindNode.mockImplementation((id: string) => {
        if (id === "node-2") return createMockNode(id, false);
        if (["node-3", "node-4"].includes(id)) return createMockNode(id, false);
        return null;
      });

      renderHook(() => useSyncEdgeSelection("node-1", false));

      expect(mockSetEdgeSelectionState).toHaveBeenCalledWith({
        "edge-1": false
      });
    });
  });

  describe("neighbor node selection", () => {
    it("selects edge when neighbor node is selected", () => {
      mockGetInputEdges.mockReturnValue([
        { id: "edge-1", source: "node-1", target: "node-2", selected: false }
      ]);
      mockGetOutputEdges.mockReturnValue([]);
      mockFindNode.mockImplementation((id: string) => {
        if (id === "node-2") return createMockNode(id, true);
        return null;
      });

      renderHook(() => useSyncEdgeSelection("node-1", false));

      expect(mockSetEdgeSelectionState).toHaveBeenCalledWith({
        "edge-1": true
      });
    });

    it("handles neighbor node not found", () => {
      mockGetInputEdges.mockReturnValue([
        { id: "edge-1", source: "node-1", target: "node-2", selected: false }
      ]);
      mockGetOutputEdges.mockReturnValue([]);
      mockFindNode.mockReturnValue(null);

      renderHook(() => useSyncEdgeSelection("node-1", true));

      expect(mockSetEdgeSelectionState).toHaveBeenCalledWith({
        "edge-1": true
      });
    });
  });

  describe("empty edge arrays", () => {
    it("handles no input edges", () => {
      mockGetInputEdges.mockReturnValue([]);
      mockGetOutputEdges.mockReturnValue([
        { id: "edge-1", source: "node-1", target: "node-2", selected: false }
      ]);
      mockFindNode.mockReturnValue(createMockNode("node-2", false));

      renderHook(() => useSyncEdgeSelection("node-1", true));

      expect(mockSetEdgeSelectionState).toHaveBeenCalledWith({
        "edge-1": true
      });
    });

    it("handles no output edges", () => {
      mockGetInputEdges.mockReturnValue([
        { id: "edge-1", source: "node-3", target: "node-1", selected: false }
      ]);
      mockGetOutputEdges.mockReturnValue([]);
      mockFindNode.mockReturnValue(createMockNode("node-3", false));

      renderHook(() => useSyncEdgeSelection("node-1", true));

      expect(mockSetEdgeSelectionState).toHaveBeenCalledWith({
        "edge-1": true
      });
    });
  });
});
