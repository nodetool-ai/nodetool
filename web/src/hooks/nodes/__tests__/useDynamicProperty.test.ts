import { renderHook, act } from "@testing-library/react";
import { useDynamicProperty } from "../useDynamicProperty";
import { useNodes } from "../../../contexts/NodeContext";

jest.mock("../../../contexts/NodeContext", () => ({
  useNodes: jest.fn()
}));

const mockUpdateNodeData = jest.fn();

describe("useDynamicProperty", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useNodes as jest.Mock).mockReturnValue({
      updateNodeData: mockUpdateNodeData
    });
  });

  it("returns handleDeleteProperty, handleAddProperty, and handleUpdatePropertyName functions", () => {
    const { result } = renderHook(() => useDynamicProperty("node-1", {}));

    expect(typeof result.current.handleDeleteProperty).toBe("function");
    expect(typeof result.current.handleAddProperty).toBe("function");
    expect(typeof result.current.handleUpdatePropertyName).toBe("function");
  });

  describe("handleDeleteProperty", () => {
    it("deletes a property from dynamicProperties", () => {
      const dynamicProperties = {
        prop1: "value1",
        prop2: "value2"
      };
      const { result } = renderHook(() =>
        useDynamicProperty("node-1", dynamicProperties)
      );

      act(() => {
        result.current.handleDeleteProperty("prop1");
      });

      expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", {
        dynamic_properties: { prop2: "value2" }
      });
    });

    it("handles deleting the only property", () => {
      const dynamicProperties = { prop1: "value1" };
      const { result } = renderHook(() =>
        useDynamicProperty("node-1", dynamicProperties)
      );

      act(() => {
        result.current.handleDeleteProperty("prop1");
      });

      expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", {
        dynamic_properties: {}
      });
    });

    it("handles deleting non-existent property gracefully", () => {
      const dynamicProperties = { prop1: "value1" };
      const { result } = renderHook(() =>
        useDynamicProperty("node-1", dynamicProperties)
      );

      act(() => {
        result.current.handleDeleteProperty("nonExistent");
      });

      expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", {
        dynamic_properties: { prop1: "value1" }
      });
    });

    it("calls updateNodeData with correct nodeId", () => {
      const dynamicProperties = { prop1: "value1" };
      const { result } = renderHook(() =>
        useDynamicProperty("test-node-id", dynamicProperties)
      );

      act(() => {
        result.current.handleDeleteProperty("prop1");
      });

      expect(mockUpdateNodeData).toHaveBeenCalledWith(
        "test-node-id",
        expect.any(Object)
      );
    });
  });

  describe("handleAddProperty", () => {
    it("adds a new property with empty string value", () => {
      const dynamicProperties = { existing: "value" };
      const { result } = renderHook(() =>
        useDynamicProperty("node-1", dynamicProperties)
      );

      act(() => {
        result.current.handleAddProperty("newProp");
      });

      expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", {
        dynamic_properties: {
          existing: "value",
          newProp: ""
        }
      });
    });

    it("adds property to empty dynamicProperties", () => {
      const dynamicProperties = {};
      const { result } = renderHook(() =>
        useDynamicProperty("node-1", dynamicProperties)
      );

      act(() => {
        result.current.handleAddProperty("firstProp");
      });

      expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", {
        dynamic_properties: { firstProp: "" }
      });
    });

    it("does not overwrite existing properties", () => {
      const dynamicProperties = { prop1: "value1" };
      const { result } = renderHook(() =>
        useDynamicProperty("node-1", dynamicProperties)
      );

      act(() => {
        result.current.handleAddProperty("prop1");
      });

      expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", {
        dynamic_properties: { prop1: "" }
      });
    });
  });

  describe("handleUpdatePropertyName", () => {
    it("renames a property from old to new name", () => {
      const dynamicProperties = {
        oldName: "value1",
        other: "value2"
      };
      const { result } = renderHook(() =>
        useDynamicProperty("node-1", dynamicProperties)
      );

      act(() => {
        result.current.handleUpdatePropertyName("oldName", "newName");
      });

      expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", {
        dynamic_properties: {
          newName: "value1",
          other: "value2"
        }
      });
    });

    it("handles renaming to the same name", () => {
      const dynamicProperties = { prop1: "value1" };
      const { result } = renderHook(() =>
        useDynamicProperty("node-1", dynamicProperties)
      );

      act(() => {
        result.current.handleUpdatePropertyName("prop1", "prop1");
      });

      expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", {
        dynamic_properties: {}
      });
    });

    it("handles renaming non-existent property", () => {
      const dynamicProperties = { prop1: "value1" };
      const { result } = renderHook(() =>
        useDynamicProperty("node-1", dynamicProperties)
      );

      act(() => {
        result.current.handleUpdatePropertyName("nonExistent", "newName");
      });

      expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", {
        dynamic_properties: {
          prop1: "value1",
          newName: undefined
        }
      });
    });
  });

  it("memoizes callbacks based on dependencies", () => {
    const { result, rerender } = renderHook(
      ({ nodeId, dynamicProperties }: { nodeId: string; dynamicProperties: Record<string, string> }) =>
        useDynamicProperty(nodeId, dynamicProperties),
      {
        initialProps: {
          nodeId: "node-1",
          dynamicProperties: { prop1: "value1" }
        }
      }
    );

    const firstDelete = result.current.handleDeleteProperty;
    const firstAdd = result.current.handleAddProperty;
    const firstUpdate = result.current.handleUpdatePropertyName;

    rerender({
      nodeId: "node-1",
      dynamicProperties: { prop2: "value2" }
    } as any);

    expect(result.current.handleDeleteProperty).not.toBe(firstDelete);
    expect(result.current.handleAddProperty).not.toBe(firstAdd);
    expect(result.current.handleUpdatePropertyName).not.toBe(firstUpdate);
  });
});
