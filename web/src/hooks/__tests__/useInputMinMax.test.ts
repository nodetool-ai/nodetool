import { renderHook } from "@testing-library/react";
import { useInputMinMax } from "../useInputMinMax";

describe("useInputMinMax", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("default bounds", () => {
    it("returns 0-100 when no constraints provided", () => {
      const { result } = renderHook(
        () => useInputMinMax({
          nodeId: "node-1",
          propertyName: "value"
        })
      );
      
      expect(result.current).toEqual({ min: 0, max: 100 });
    });

    it("returns 0-100 when propertyMin and propertyMax are null", () => {
      const { result } = renderHook(
        () => useInputMinMax({
          nodeId: "node-1",
          propertyName: "value",
          propertyMin: null,
          propertyMax: null
        })
      );
      
      expect(result.current).toEqual({ min: 0, max: 100 });
    });

    it("returns 0-100 when propertyMin and propertyMax are undefined", () => {
      const { result } = renderHook(
        () => useInputMinMax({
          nodeId: "node-1",
          propertyName: "value",
          propertyMin: undefined,
          propertyMax: undefined
        })
      );
      
      expect(result.current).toEqual({ min: 0, max: 100 });
    });
  });

  describe("property constraints", () => {
    it("uses propertyMin when provided as number", () => {
      const { result } = renderHook(
        () => useInputMinMax({
          nodeId: "node-1",
          propertyName: "value",
          propertyMin: 10,
          propertyMax: 90
        })
      );
      
      expect(result.current).toEqual({ min: 10, max: 90 });
    });

    it("uses propertyMax when provided as number", () => {
      const { result } = renderHook(
        () => useInputMinMax({
          nodeId: "node-1",
          propertyName: "value",
          propertyMin: 5,
          propertyMax: 200
        })
      );
      
      expect(result.current).toEqual({ min: 5, max: 200 });
    });

    it("falls back to defaults when propertyMin is not a number", () => {
      const { result } = renderHook(
        () => useInputMinMax({
          nodeId: "node-1",
          propertyName: "value",
          propertyMin: "10" as any,
          propertyMax: 100
        })
      );
      
      expect(result.current).toEqual({ min: 0, max: 100 });
    });

    it("falls back to defaults when propertyMax is not a number", () => {
      const { result } = renderHook(
        () => useInputMinMax({
          nodeId: "node-1",
          propertyName: "value",
          propertyMin: 0,
          propertyMax: "200" as any
        })
      );
      
      expect(result.current).toEqual({ min: 0, max: 100 });
    });
  });

  describe("edge cases", () => {
    it("handles negative min value", () => {
      const { result } = renderHook(
        () => useInputMinMax({
          nodeId: "node-1",
          propertyName: "value",
          propertyMin: -50,
          propertyMax: 50
        })
      );
      
      expect(result.current).toEqual({ min: -50, max: 50 });
    });

    it("handles large max value", () => {
      const { result } = renderHook(
        () => useInputMinMax({
          nodeId: "node-1",
          propertyName: "value",
          propertyMin: 0,
          propertyMax: 1000000
        })
      );
      
      expect(result.current).toEqual({ min: 0, max: 1000000 });
    });

    it("handles decimal values", () => {
      const { result } = renderHook(
        () => useInputMinMax({
          nodeId: "node-1",
          propertyName: "value",
          propertyMin: 0.001,
          propertyMax: 0.999
        })
      );
      
      expect(result.current).toEqual({ min: 0.001, max: 0.999 });
    });

    it("handles min greater than max by using max value", () => {
      const { result } = renderHook(
        () => useInputMinMax({
          nodeId: "node-1",
          propertyName: "value",
          propertyMin: 100,
          propertyMax: 50
        })
      );
      
      expect(result.current).toEqual({ min: 100, max: 50 });
    });

    it("handles zero as valid min", () => {
      const { result } = renderHook(
        () => useInputMinMax({
          nodeId: "node-1",
          propertyName: "value",
          propertyMin: 0,
          propertyMax: 100
        })
      );
      
      expect(result.current).toEqual({ min: 0, max: 100 });
    });

    it("handles zero as valid max", () => {
      const { result } = renderHook(
        () => useInputMinMax({
          nodeId: "node-1",
          propertyName: "value",
          propertyMin: -10,
          propertyMax: 0
        })
      );
      
      expect(result.current).toEqual({ min: -10, max: 0 });
    });
  });

  describe("property name filtering", () => {
    it("works with different property names", () => {
      const { result } = renderHook(
        () => useInputMinMax({
          nodeId: "node-1",
          propertyName: "temperature",
          propertyMin: 0,
          propertyMax: 1
        })
      );
      
      expect(result.current).toEqual({ min: 0, max: 1 });
    });

    it("works with numeric property values", () => {
      const { result } = renderHook(
        () => useInputMinMax({
          nodeId: "node-1",
          propertyName: "value",
          propertyMin: 1,
          propertyMax: 10
        })
      );
      
      expect(result.current).toEqual({ min: 1, max: 10 });
    });
  });
});
