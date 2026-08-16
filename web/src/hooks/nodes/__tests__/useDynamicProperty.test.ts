import { makeNodeStore, nodeStoreRenderers } from "../../../test-utils/nodeStore";
import { act } from "@testing-library/react";
import { useDynamicProperty } from "../useDynamicProperty";
import type { TypeMetadata } from "../../../stores/ApiTypes";
import type { DynamicSlotDeclaration } from "../../../stores/NodeData";

const mockUpdateNodeData = jest.fn();
const mockUpdateEdgeHandle = jest.fn();

const type = (name: string): TypeMetadata => ({
  type: name,
  optional: false,
  values: null,
  type_args: [],
  type_name: null
});

/** Node data the mocked `findNode` returns; set per test. */
let nodeSlots: Record<string, DynamicSlotDeclaration> | undefined;

const mockFindNode = jest.fn(() => ({
  id: "node-1",
  data: { dynamic_inputs: nodeSlots }
}));

const { renderHook } = nodeStoreRenderers(
  makeNodeStore({
    updateNodeData: mockUpdateNodeData,
    updateEdgeHandle: mockUpdateEdgeHandle,
    findNode: mockFindNode
  })
);

describe("useDynamicProperty", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    nodeSlots = undefined;
  });

  it("exposes the slot mutation callbacks", () => {
    const { result } = renderHook(() => useDynamicProperty("node-1", {}));

    expect(result.current.handleDeleteProperty).toEqual(expect.any(Function));
    expect(result.current.handleAddProperty).toEqual(expect.any(Function));
    expect(result.current.handleUpdatePropertyName).toEqual(expect.any(Function));
    expect(result.current.handleUpdatePropertyType).toEqual(expect.any(Function));
  });

  describe("handleDeleteProperty", () => {
    it("deletes from both maps", () => {
      nodeSlots = { prop1: { type: type("image") }, prop2: { type: type("str") } };
      const { result } = renderHook(() =>
        useDynamicProperty("node-1", { prop1: "value1", prop2: "value2" })
      );

      act(() => {
        result.current.handleDeleteProperty("prop1");
      });

      expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", {
        dynamic_properties: { prop2: "value2" },
        dynamic_inputs: { prop2: { type: type("str") } }
      });
    });

    it("handles deleting the only property", () => {
      const { result } = renderHook(() =>
        useDynamicProperty("node-1", { prop1: "value1" })
      );

      act(() => {
        result.current.handleDeleteProperty("prop1");
      });

      expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", {
        dynamic_properties: {},
        dynamic_inputs: {}
      });
    });

    it("handles deleting a non-existent property gracefully", () => {
      const { result } = renderHook(() =>
        useDynamicProperty("node-1", { prop1: "value1" })
      );

      act(() => {
        result.current.handleDeleteProperty("nonExistent");
      });

      expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", {
        dynamic_properties: { prop1: "value1" },
        dynamic_inputs: {}
      });
    });
  });

  describe("handleAddProperty", () => {
    it("creates an untyped slot when no type is given (legacy behavior)", () => {
      const { result } = renderHook(() =>
        useDynamicProperty("node-1", { existing: "value" })
      );

      act(() => {
        result.current.handleAddProperty("newProp");
      });

      expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", {
        dynamic_properties: { existing: "value", newProp: "" },
        dynamic_inputs: {}
      });
    });

    it("writes both maps when a type is given", () => {
      const { result } = renderHook(() => useDynamicProperty("node-1", {}));

      act(() => {
        result.current.handleAddProperty("pic", type("image"));
      });

      expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", {
        dynamic_properties: { pic: null },
        dynamic_inputs: { pic: { type: type("image") } }
      });
    });

    it("seeds the value from the slot type", () => {
      const { result } = renderHook(() => useDynamicProperty("node-1", {}));

      act(() => {
        result.current.handleAddProperty("count", type("int"));
      });

      expect(mockUpdateNodeData).toHaveBeenCalledWith(
        "node-1",
        expect.objectContaining({ dynamic_properties: { count: 0 } })
      );
    });

    it("keeps slots declared by other names", () => {
      nodeSlots = { existing: { type: type("str") } };
      const { result } = renderHook(() =>
        useDynamicProperty("node-1", { existing: "value" })
      );

      act(() => {
        result.current.handleAddProperty("pic", type("image"));
      });

      expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", {
        dynamic_properties: { existing: "value", pic: null },
        dynamic_inputs: {
          existing: { type: type("str") },
          pic: { type: type("image") }
        }
      });
    });
  });

  describe("handleUpdatePropertyName", () => {
    it("renames value and declaration in one store update", () => {
      nodeSlots = { oldName: { type: type("image") } };
      const { result } = renderHook(() =>
        useDynamicProperty("node-1", { oldName: "value1", other: "value2" })
      );

      act(() => {
        result.current.handleUpdatePropertyName("oldName", "newName");
      });

      expect(mockUpdateNodeData).toHaveBeenCalledTimes(1);
      expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", {
        dynamic_properties: { newName: "value1", other: "value2" },
        dynamic_inputs: { newName: { type: type("image") } }
      });
    });

    it("moves connected edges onto the new handle", () => {
      nodeSlots = { oldName: { type: type("image") } };
      const { result } = renderHook(() =>
        useDynamicProperty("node-1", { oldName: "value1" })
      );

      act(() => {
        result.current.handleUpdatePropertyName("oldName", "newName");
      });

      expect(mockUpdateEdgeHandle).toHaveBeenCalledWith(
        "node-1",
        "oldName",
        "newName"
      );
    });

    it("leaves an untyped slot untyped", () => {
      const { result } = renderHook(() =>
        useDynamicProperty("node-1", { oldName: "value1" })
      );

      act(() => {
        result.current.handleUpdatePropertyName("oldName", "newName");
      });

      expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", {
        dynamic_properties: { newName: "value1" },
        dynamic_inputs: {}
      });
    });
  });

  describe("handleUpdatePropertyType", () => {
    it("declares the type and reseeds an incompatible value", () => {
      const { result } = renderHook(() =>
        useDynamicProperty("node-1", { pic: "some text" })
      );

      act(() => {
        result.current.handleUpdatePropertyType("pic", type("image"));
      });

      expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", {
        dynamic_properties: { pic: null },
        dynamic_inputs: { pic: { type: type("image") } }
      });
    });

    it("keeps a value that still fits the new type", () => {
      const { result } = renderHook(() =>
        useDynamicProperty("node-1", { n: 7 })
      );

      act(() => {
        result.current.handleUpdatePropertyType("n", type("float"));
      });

      expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", {
        dynamic_properties: { n: 7 },
        dynamic_inputs: { n: { type: type("float") } }
      });
    });

    it("retypes an existing declaration, keeping its description", () => {
      nodeSlots = { n: { type: type("int"), description: "a count" } };
      const { result } = renderHook(() =>
        useDynamicProperty("node-1", { n: 7 })
      );

      act(() => {
        result.current.handleUpdatePropertyType("n", type("float"));
      });

      expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", {
        dynamic_properties: { n: 7 },
        dynamic_inputs: { n: { type: type("float"), description: "a count" } }
      });
    });

    it("reseeds when the old ref is a different ref type", () => {
      nodeSlots = { pic: { type: type("image") } };
      const { result } = renderHook(() =>
        useDynamicProperty("node-1", { pic: { type: "image", uri: "a.png" } })
      );

      act(() => {
        result.current.handleUpdatePropertyType("pic", type("audio"));
      });

      expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", {
        dynamic_properties: { pic: null },
        dynamic_inputs: { pic: { type: type("audio") } }
      });
    });

    it("keeps a ref the new type still accepts", () => {
      nodeSlots = { pic: { type: type("any") } };
      const ref = { type: "image", uri: "a.png" };
      const { result } = renderHook(() =>
        useDynamicProperty("node-1", { pic: ref })
      );

      act(() => {
        result.current.handleUpdatePropertyType("pic", type("image"));
      });

      expect(mockUpdateNodeData).toHaveBeenCalledWith("node-1", {
        dynamic_properties: { pic: ref },
        dynamic_inputs: { pic: { type: type("image") } }
      });
    });
  });

  it("memoizes callbacks based on dependencies", () => {
    const { result, rerender } = renderHook(
      ({
        nodeId,
        dynamicProperties
      }: {
        nodeId: string;
        dynamicProperties: Record<string, string>;
      }) => useDynamicProperty(nodeId, dynamicProperties),
      {
        initialProps: {
          nodeId: "node-1",
          dynamicProperties: { prop1: "value1" } as Record<string, string>
        }
      }
    );

    const firstDelete = result.current.handleDeleteProperty;
    const firstAdd = result.current.handleAddProperty;
    const firstUpdate = result.current.handleUpdatePropertyName;

    rerender({
      nodeId: "node-1",
      dynamicProperties: { prop2: "value2" }
    });

    expect(result.current.handleDeleteProperty).not.toBe(firstDelete);
    expect(result.current.handleAddProperty).not.toBe(firstAdd);
    expect(result.current.handleUpdatePropertyName).not.toBe(firstUpdate);
  });
});
