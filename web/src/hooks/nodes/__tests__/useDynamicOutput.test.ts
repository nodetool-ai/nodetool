import { renderHook, act } from "@testing-library/react";
import { useDynamicOutput } from "../useDynamicOutput";
import { useNodes } from "../../../contexts/NodeContext";
import { TypeMetadata } from "../../../stores/ApiTypes";

jest.mock("../../../contexts/NodeContext", () => ({
  useNodes: jest.fn()
}));

const mockUpdateNodeData = jest.fn();

const createTypeMetadata = (type: string, optional = false, typeArgs: TypeMetadata[] = []): TypeMetadata => ({
  type,
  optional,
  type_args: typeArgs
});

describe("useDynamicOutput", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useNodes as jest.Mock).mockReturnValue({
      updateNodeData: mockUpdateNodeData
    });
  });

  it("returns handleDeleteOutput, handleAddOutput, and handleRenameOutput functions", () => {
    const { result } = renderHook(() => useDynamicOutput("node-1", {}));

    expect(typeof result.current.handleDeleteOutput).toBe("function");
    expect(typeof result.current.handleAddOutput).toBe("function");
    expect(typeof result.current.handleRenameOutput).toBe("function");
  });

  describe("handleDeleteOutput", () => {
    it("deletes an output from dynamicOutputs", () => {
      const dynamicOutputs: Record<string, TypeMetadata> = {
        output1: createTypeMetadata("text"),
        output2: createTypeMetadata("image")
      };
      const { result } = renderHook(() =>
        useDynamicOutput("node-1", dynamicOutputs)
      );

      act(() => {
        result.current.handleDeleteOutput("output1");
      });

      expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", {
        dynamic_outputs: { output2: createTypeMetadata("image") }
      });
    });

    it("handles deleting the only output", () => {
      const dynamicOutputs: Record<string, TypeMetadata> = {
        output1: createTypeMetadata("text")
      };
      const { result } = renderHook(() =>
        useDynamicOutput("node-1", dynamicOutputs)
      );

      act(() => {
        result.current.handleDeleteOutput("output1");
      });

      expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", {
        dynamic_outputs: {}
      });
    });

    it("handles deleting non-existent output gracefully", () => {
      const dynamicOutputs: Record<string, TypeMetadata> = {
        output1: createTypeMetadata("text")
      };
      const { result } = renderHook(() =>
        useDynamicOutput("node-1", dynamicOutputs)
      );

      act(() => {
        result.current.handleDeleteOutput("nonExistent");
      });

      expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", {
        dynamic_outputs: { output1: createTypeMetadata("text") }
      });
    });
  });

  describe("handleAddOutput", () => {
    it("adds a new output with type metadata", () => {
      const dynamicOutputs: Record<string, TypeMetadata> = {
        existing: createTypeMetadata("text")
      };
      const newOutput: TypeMetadata = createTypeMetadata("image");
      const { result } = renderHook(() =>
        useDynamicOutput("node-1", dynamicOutputs)
      );

      act(() => {
        result.current.handleAddOutput("newOutput", newOutput);
      });

      expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", {
        dynamic_outputs: {
          existing: createTypeMetadata("text"),
          newOutput: createTypeMetadata("image")
        }
      });
    });

    it("adds output to empty dynamicOutputs", () => {
      const dynamicOutputs: Record<string, TypeMetadata> = {};
      const newOutput: TypeMetadata = createTypeMetadata("audio");
      const { result } = renderHook(() =>
        useDynamicOutput("node-1", dynamicOutputs)
      );

      act(() => {
        result.current.handleAddOutput("firstOutput", newOutput);
      });

      expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", {
        dynamic_outputs: { firstOutput: createTypeMetadata("audio") }
      });
    });

    it("preserves all properties of TypeMetadata", () => {
      const dynamicOutputs: Record<string, TypeMetadata> = {};
      const newOutput: TypeMetadata = {
        type: "dataframe",
        optional: false,
        type_args: [],
        type_name: "A dataframe output"
      };
      const { result } = renderHook(() =>
        useDynamicOutput("node-1", dynamicOutputs)
      );

      act(() => {
        result.current.handleAddOutput("dataOutput", newOutput);
      });

      expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", {
        dynamic_outputs: {
          dataOutput: {
            type: "dataframe",
            optional: false,
            type_args: [],
            type_name: "A dataframe output"
          }
        }
      });
    });
  });

  describe("handleRenameOutput", () => {
    it("renames an output from old to new name", () => {
      const dynamicOutputs: Record<string, TypeMetadata> = {
        oldName: createTypeMetadata("text"),
        other: createTypeMetadata("image")
      };
      const { result } = renderHook(() =>
        useDynamicOutput("node-1", dynamicOutputs)
      );

      act(() => {
        result.current.handleRenameOutput("oldName", "newName");
      });

      expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", {
        dynamic_outputs: {
          newName: createTypeMetadata("text"),
          other: createTypeMetadata("image")
        }
      });
    });

    it("handles renaming to the same name", () => {
      const dynamicOutputs: Record<string, TypeMetadata> = {
        output1: createTypeMetadata("text")
      };
      const { result } = renderHook(() =>
        useDynamicOutput("node-1", dynamicOutputs)
      );

      act(() => {
        result.current.handleRenameOutput("output1", "output1");
      });

      expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", {
        dynamic_outputs: {}
      });
    });

    it("handles renaming non-existent output", () => {
      const dynamicOutputs: Record<string, TypeMetadata> = {
        output1: createTypeMetadata("text")
      };
      const { result } = renderHook(() =>
        useDynamicOutput("node-1", dynamicOutputs)
      );

      act(() => {
        result.current.handleRenameOutput("nonExistent", "newName");
      });

      expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", {
        dynamic_outputs: {
          output1: createTypeMetadata("text"),
          newName: undefined
        }
      });
    });
  });

  it("memoizes callbacks based on dependencies", () => {
    const initialOutputs: Record<string, TypeMetadata> = { output1: createTypeMetadata("text") };
    const { result, rerender } = renderHook(
      ({ nodeId, dynamicOutputs }: { nodeId: string; dynamicOutputs: Record<string, TypeMetadata> }) =>
        useDynamicOutput(nodeId, dynamicOutputs),
      {
        initialProps: {
          nodeId: "node-1",
          dynamicOutputs: initialOutputs
        }
      }
    );

    const firstDelete = result.current.handleDeleteOutput;
    const firstAdd = result.current.handleAddOutput;
    const firstRename = result.current.handleRenameOutput;

    const newOutputs: Record<string, TypeMetadata> = { output2: createTypeMetadata("image") };
    rerender({
      nodeId: "node-1",
      dynamicOutputs: newOutputs
    });

    expect(result.current.handleDeleteOutput).not.toBe(firstDelete);
    expect(result.current.handleAddOutput).not.toBe(firstAdd);
    expect(result.current.handleRenameOutput).not.toBe(firstRename);
  });

  it("works with undefined dynamicOutputs", () => {
    const { result } = renderHook(() =>
      useDynamicOutput("node-1", undefined as unknown as Record<string, TypeMetadata>)
    );

    act(() => {
      result.current.handleAddOutput("newOutput", createTypeMetadata("text"));
    });

    expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", {
      dynamic_outputs: { newOutput: createTypeMetadata("text") }
    });
  });
});
