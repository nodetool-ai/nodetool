import { renderHook } from "@testing-library/react";
import { useInputMinMax } from "../useInputMinMax";
import { useStoreWithEqualityFn } from "zustand/traditional";

jest.mock("../../contexts/NodeContext", () => ({
  NodeContext: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
  },
}));

jest.mock("zustand/traditional", () => ({
  useStoreWithEqualityFn: jest.fn(),
}));

jest.mock("zustand/shallow", () => ({
  shallow: {},
}));

describe("useInputMinMax", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useStoreWithEqualityFn as jest.Mock).mockReturnValue([]);
  });

  it("should return default min/max when no options provided", () => {
    const { result } = renderHook(() =>
      useInputMinMax({
        nodeId: "test-node",
        propertyName: "value",
      })
    );

    expect(result.current).toEqual({ min: 0, max: 100 });
  });

  it("should use property min/max when provided", () => {
    const { result } = renderHook(() =>
      useInputMinMax({
        nodeId: "test-node",
        propertyName: "value",
        propertyMin: 10,
        propertyMax: 50,
      })
    );

    expect(result.current).toEqual({ min: 10, max: 50 });
  });

  it("should handle null propertyMin/max", () => {
    const { result } = renderHook(() =>
      useInputMinMax({
        nodeId: "test-node",
        propertyName: "value",
        propertyMin: null,
        propertyMax: null,
      })
    );

    expect(result.current).toEqual({ min: 0, max: 100 });
  });

  it("should handle undefined propertyMin/max", () => {
    const { result } = renderHook(() =>
      useInputMinMax({
        nodeId: "test-node",
        propertyName: "value",
      })
    );

    expect(result.current).toEqual({ min: 0, max: 100 });
  });

  it("should use 0 as min when propertyMin is not a number", () => {
    const { result } = renderHook(() =>
      useInputMinMax({
        nodeId: "test-node",
        propertyName: "value",
        propertyMin: undefined,
        propertyMax: 50,
      })
    );

    expect(result.current).toEqual({ min: 0, max: 50 });
  });

  it("should use 100 as max when propertyMax is not a number", () => {
    const { result } = renderHook(() =>
      useInputMinMax({
        nodeId: "test-node",
        propertyName: "value",
        propertyMin: 10,
        propertyMax: undefined,
      })
    );

    expect(result.current).toEqual({ min: 10, max: 100 });
  });
});
