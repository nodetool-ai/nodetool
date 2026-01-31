import { renderHook } from "@testing-library/react";
import { useInputMinMax } from "../useInputMinMax";

// Mock the zustand traditional import to return empty nodes by default
jest.mock("zustand/traditional", () => ({
  useStoreWithEqualityFn: jest.fn((_store, selector, _eq) => {
    return selector({ nodes: [] });
  })
}));

jest.mock("zustand/shallow", () => ({
  shallow: jest.fn()
}));

describe("useInputMinMax", () => {
  describe("without NodeContext", () => {
    it("returns property min/max when provided", () => {
      const { result } = renderHook(() =>
        useInputMinMax({
          nodeId: "node-1",
          propertyName: "value",
          propertyMin: 10,
          propertyMax: 100
        })
      );

      expect(result.current.min).toBe(10);
      expect(result.current.max).toBe(100);
    });

    it("returns default values when no min/max provided", () => {
      const { result } = renderHook(() =>
        useInputMinMax({
          nodeId: "node-1",
          propertyName: "value"
        })
      );

      expect(result.current.min).toBe(0);
      expect(result.current.max).toBe(99999);
    });

    it("handles null property min/max", () => {
      const { result } = renderHook(() =>
        useInputMinMax({
          nodeId: "node-1",
          propertyName: "value",
          propertyMin: null,
          propertyMax: null
        })
      );

      expect(result.current.min).toBe(0);
      expect(result.current.max).toBe(99999);
    });
  });

  describe("property bounds priority", () => {
    it("uses propertyMin when provided", () => {
      const { result } = renderHook(() =>
        useInputMinMax({
          nodeId: "node-1",
          propertyName: "value",
          propertyMin: 5
        })
      );

      expect(result.current.min).toBe(5);
    });

    it("uses propertyMax when provided", () => {
      const { result } = renderHook(() =>
        useInputMinMax({
          nodeId: "node-1",
          propertyName: "value",
          propertyMax: 500
        })
      );

      expect(result.current.max).toBe(500);
    });

    it("uses zero as default min", () => {
      const { result } = renderHook(() =>
        useInputMinMax({
          nodeId: "node-1",
          propertyName: "value"
        })
      );

      expect(result.current.min).toBe(0);
    });

    it("uses 99999 as default max", () => {
      const { result } = renderHook(() =>
        useInputMinMax({
          nodeId: "node-1",
          propertyName: "value"
        })
      );

      expect(result.current.max).toBe(99999);
    });
  });

  describe("node type filtering", () => {
    it("does not lookup bounds for non-input node types", () => {
      // Without context, the hook falls back to property bounds
      const { result } = renderHook(() =>
        useInputMinMax({
          nodeType: "nodetool.other.Node",
          nodeId: "node-1",
          propertyName: "value",
          propertyMin: 5,
          propertyMax: 50
        })
      );

      expect(result.current.min).toBe(5);
      expect(result.current.max).toBe(50);
    });

    it("only considers lookup for FloatInput nodes", () => {
      // Even for FloatInput, without context/nodes it falls back to property bounds
      const { result } = renderHook(() =>
        useInputMinMax({
          nodeType: "nodetool.input.FloatInput",
          nodeId: "node-1",
          propertyName: "value",
          propertyMin: 10,
          propertyMax: 100
        })
      );

      expect(result.current.min).toBe(10);
      expect(result.current.max).toBe(100);
    });

    it("only considers lookup for IntegerInput nodes", () => {
      const { result } = renderHook(() =>
        useInputMinMax({
          nodeType: "nodetool.input.IntegerInput",
          nodeId: "node-1",
          propertyName: "value",
          propertyMin: 1,
          propertyMax: 10
        })
      );

      expect(result.current.min).toBe(1);
      expect(result.current.max).toBe(10);
    });

    it("does not lookup for non-value property names", () => {
      const { result } = renderHook(() =>
        useInputMinMax({
          nodeType: "nodetool.input.FloatInput",
          nodeId: "node-1",
          propertyName: "other_property",
          propertyMin: 1,
          propertyMax: 10
        })
      );

      expect(result.current.min).toBe(1);
      expect(result.current.max).toBe(10);
    });
  });

  describe("edge cases", () => {
    it("handles undefined nodeType", () => {
      const { result } = renderHook(() =>
        useInputMinMax({
          nodeId: "node-1",
          propertyName: "value",
          propertyMin: 0,
          propertyMax: 100
        })
      );

      expect(result.current.min).toBe(0);
      expect(result.current.max).toBe(100);
    });

    it("returns an object with min and max properties", () => {
      const { result } = renderHook(() =>
        useInputMinMax({
          nodeId: "node-1",
          propertyName: "value"
        })
      );

      expect(result.current).toHaveProperty("min");
      expect(result.current).toHaveProperty("max");
      expect(typeof result.current.min).toBe("number");
      expect(typeof result.current.max).toBe("number");
    });
  });
});
