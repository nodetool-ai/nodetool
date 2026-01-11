import { renderHook, act } from "@testing-library/react";
import { useNodeColoring } from "../useNodeColoring";
import { useNodeColorPresetsStore } from "../../stores/NodeColorPresetsStore";

jest.mock("@xyflow/react", () => ({
  useReactFlow: jest.fn(() => ({
    setNodes: jest.fn(),
    setEdges: jest.fn(),
    getEdges: jest.fn(() => [])
  }))
}));

jest.mock("../../contexts/NodeContext", () => ({
  useNodes: jest.fn(),
  useTemporalNodes: jest.fn(() => ({
    pause: jest.fn(),
    resume: jest.fn()
  }))
}));

import { useNodes } from "../../contexts/NodeContext";

const mockUseNodes = useNodes as unknown as jest.Mock;

describe("useNodeColoring", () => {
  const mockUpdateNodeData = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    act(() => {
      useNodeColorPresetsStore.setState({
        presets: [
          { id: "preset-1", name: "Input", color: "#3B82F6", createdAt: Date.now() },
          { id: "preset-2", name: "Output", color: "#10B981", createdAt: Date.now() }
        ],
        selectedPresetId: null,
        isDialogOpen: false
      });
    });

    mockUseNodes.mockImplementation((selector: (state: any) => any) =>
      selector({
        getSelectedNodes: jest.fn(() => []),
        updateNodeData: mockUpdateNodeData
      })
    );
  });

  describe("applyColorToSelected", () => {
    it("should apply color to selected nodes", () => {
      const mockNodes = [
        { id: "node-1", data: { properties: {} } },
        { id: "node-2", data: { properties: {} } }
      ];

      mockUseNodes.mockImplementation((selector: (state: any) => any) =>
        selector({
          getSelectedNodes: jest.fn(() => mockNodes),
          updateNodeData: mockUpdateNodeData
        })
      );

      const { result } = renderHook(() => useNodeColoring());

      act(() => {
        result.current.applyColorToSelected("#FF0000");
      });

      expect(mockUpdateNodeData).toHaveBeenCalledTimes(2);
      expect(mockUpdateNodeData).toHaveBeenCalledWith(
        "node-1",
        expect.objectContaining({
          properties: expect.objectContaining({ node_color: "#FF0000" })
        })
      );
      expect(mockUpdateNodeData).toHaveBeenCalledWith(
        "node-2",
        expect.objectContaining({
          properties: expect.objectContaining({ node_color: "#FF0000" })
        })
      );
    });

    it("should do nothing when no nodes are selected", () => {
      mockUseNodes.mockImplementation((selector: (state: any) => any) =>
        selector({
          getSelectedNodes: jest.fn(() => []),
          updateNodeData: mockUpdateNodeData
        })
      );

      const { result } = renderHook(() => useNodeColoring());

      act(() => {
        result.current.applyColorToSelected("#FF0000");
      });

      expect(mockUpdateNodeData).not.toHaveBeenCalled();
    });

    it("should preserve existing properties when applying color", () => {
      const mockNodes = [
        {
          id: "node-1",
          data: {
            properties: { existingProp: "value", node_color: "#FFFFFF" }
          }
        }
      ];

      mockUseNodes.mockImplementation((selector: (state: any) => any) =>
        selector({
          getSelectedNodes: jest.fn(() => mockNodes),
          updateNodeData: mockUpdateNodeData
        })
      );

      const { result } = renderHook(() => useNodeColoring());

      act(() => {
        result.current.applyColorToSelected("#FF0000");
      });

      expect(mockUpdateNodeData).toHaveBeenCalledWith(
        "node-1",
        expect.objectContaining({
          properties: expect.objectContaining({
            existingProp: "value",
            node_color: "#FF0000"
          })
        })
      );
    });
  });

  describe("applyPresetToSelected", () => {
    it("should apply preset color to selected nodes", () => {
      const mockNodes = [{ id: "node-1", data: { properties: {} } }];

      mockUseNodes.mockImplementation((selector: (state: any) => any) =>
        selector({
          getSelectedNodes: jest.fn(() => mockNodes),
          updateNodeData: mockUpdateNodeData
        })
      );

      const { result } = renderHook(() => useNodeColoring());

      act(() => {
        result.current.applyPresetToSelected("preset-1");
      });

      expect(mockUpdateNodeData).toHaveBeenCalledWith(
        "node-1",
        expect.objectContaining({
          properties: expect.objectContaining({ node_color: "#3B82F6" })
        })
      );
    });

    it("should do nothing when no nodes are selected", () => {
      mockUseNodes.mockImplementation((selector: (state: any) => any) =>
        selector({
          getSelectedNodes: jest.fn(() => []),
          updateNodeData: mockUpdateNodeData
        })
      );

      const { result } = renderHook(() => useNodeColoring());

      act(() => {
        result.current.applyPresetToSelected("preset-1");
      });

      expect(mockUpdateNodeData).not.toHaveBeenCalled();
    });

    it("should do nothing when preset is not found", () => {
      const mockNodes = [{ id: "node-1", data: { properties: {} } }];

      mockUseNodes.mockImplementation((selector: (state: any) => any) =>
        selector({
          getSelectedNodes: jest.fn(() => mockNodes),
          updateNodeData: mockUpdateNodeData
        })
      );

      const { result } = renderHook(() => useNodeColoring());

      act(() => {
        result.current.applyPresetToSelected("nonexistent-preset");
      });

      expect(mockUpdateNodeData).not.toHaveBeenCalled();
    });
  });

  describe("saveSelectedColorAsPreset", () => {
    it("should save selected node's color as preset", () => {
      const mockNodes = [
        {
          id: "node-1",
          data: { properties: { node_color: "#ABCDEF" } }
        }
      ];

      mockUseNodes.mockImplementation((selector: (state: any) => any) =>
        selector({
          getSelectedNodes: jest.fn(() => mockNodes),
          updateNodeData: mockUpdateNodeData
        })
      );

      const { result } = renderHook(() => useNodeColoring());

      act(() => {
        result.current.saveSelectedColorAsPreset("My Preset");
      });

      const presets = useNodeColorPresetsStore.getState().presets;
      expect(presets[0].name).toBe("My Preset");
      expect(presets[0].color).toBe("#ABCDEF");
    });

    it("should do nothing when no nodes are selected", () => {
      mockUseNodes.mockImplementation((selector: (state: any) => any) =>
        selector({
          getSelectedNodes: jest.fn(() => []),
          updateNodeData: mockUpdateNodeData
        })
      );

      const { result } = renderHook(() => useNodeColoring());

      act(() => {
        result.current.saveSelectedColorAsPreset("My Preset");
      });

      const presets = useNodeColorPresetsStore.getState().presets;
      expect(presets.length).toBe(2); // Original presets
    });
  });

  describe("hasSelectedNodes", () => {
    it("should return true when nodes are selected", () => {
      mockUseNodes.mockImplementation((selector: (state: any) => any) =>
        selector({
          getSelectedNodes: jest.fn(() => [{ id: "node-1", data: {} }]),
          updateNodeData: mockUpdateNodeData
        })
      );

      const { result } = renderHook(() => useNodeColoring());

      expect(result.current.hasSelectedNodes).toBe(true);
      expect(result.current.selectedNodesCount).toBe(1);
    });

    it("should return false when no nodes are selected", () => {
      mockUseNodes.mockImplementation((selector: (state: any) => any) =>
        selector({
          getSelectedNodes: jest.fn(() => []),
          updateNodeData: mockUpdateNodeData
        })
      );

      const { result } = renderHook(() => useNodeColoring());

      expect(result.current.hasSelectedNodes).toBe(false);
      expect(result.current.selectedNodesCount).toBe(0);
    });
  });
});
