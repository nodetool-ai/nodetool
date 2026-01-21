import { renderHook } from "@testing-library/react";
import { useInputMinMax } from "../useInputMinMax";

jest.mock("react", () => ({
  ...jest.requireActual("react"),
  useContext: jest.fn(() => ({ subscribe: jest.fn(), getState: jest.fn(() => ({ nodes: [] })) })),
}));

jest.mock("zustand/traditional", () => ({
  useStoreWithEqualityFn: jest.fn(),
}));

import { useStoreWithEqualityFn } from "zustand/traditional";

describe("useInputMinMax", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useStoreWithEqualityFn as jest.Mock).mockReturnValue([]);
  });

  const defaultOptions = {
    nodeId: "test-node",
    propertyName: "value",
    propertyMin: 0,
    propertyMax: 100,
  };

  it("returns default bounds when nodeType is not FloatInput or IntegerInput", () => {
    const { result } = renderHook(() =>
      useInputMinMax({ ...defaultOptions, nodeType: "other" })
    );

    expect(result.current).toEqual({ min: 0, max: 100 });
  });

  it("returns default bounds when propertyName is not 'value'", () => {
    const { result } = renderHook(() =>
      useInputMinMax({ ...defaultOptions, propertyName: "other" })
    );

    expect(result.current).toEqual({ min: 0, max: 100 });
  });

  it("uses propertyMin and propertyMax when no node bounds are found", () => {
    const { result } = renderHook(() =>
      useInputMinMax({
        nodeType: "nodetool.input.FloatInput",
        nodeId: "test-node",
        propertyName: "value",
        propertyMin: 10,
        propertyMax: 90,
      })
    );

    expect(result.current).toEqual({ min: 10, max: 90 });
  });

  it("uses node min/max bounds when available for FloatInput", () => {
    const mockNodes = [
      {
        id: "test-node",
        data: {
          properties: {
            min: 5,
            max: 95,
          },
        },
      },
    ];

    (useStoreWithEqualityFn as jest.Mock).mockReturnValue(mockNodes);

    const { result } = renderHook(() =>
      useInputMinMax({
        nodeType: "nodetool.input.FloatInput",
        nodeId: "test-node",
        propertyName: "value",
        propertyMin: 0,
        propertyMax: 100,
      })
    );

    expect(result.current).toEqual({ min: 5, max: 95 });
  });

  it("uses node min/max bounds when available for IntegerInput", () => {
    const mockNodes = [
      {
        id: "test-node",
        data: {
          properties: {
            min: 1,
            max: 50,
          },
        },
      },
    ];

    (useStoreWithEqualityFn as jest.Mock).mockReturnValue(mockNodes);

    const { result } = renderHook(() =>
      useInputMinMax({
        nodeType: "nodetool.input.IntegerInput",
        nodeId: "test-node",
        propertyName: "value",
        propertyMin: 0,
        propertyMax: 100,
      })
    );

    expect(result.current).toEqual({ min: 1, max: 50 });
  });

  it("falls back to property bounds when node bounds are undefined", () => {
    const mockNodes = [
      {
        id: "test-node",
        data: {
          properties: {},
        },
      },
    ];

    (useStoreWithEqualityFn as jest.Mock).mockReturnValue(mockNodes);

    const { result } = renderHook(() =>
      useInputMinMax({
        nodeType: "nodetool.input.FloatInput",
        nodeId: "test-node",
        propertyName: "value",
        propertyMin: 20,
        propertyMax: 80,
      })
    );

    expect(result.current).toEqual({ min: 20, max: 80 });
  });

  it("uses node bounds over property bounds when both are defined", () => {
    const mockNodes = [
      {
        id: "test-node",
        data: {
          properties: {
            min: 100,
            max: 200,
          },
        },
      },
    ];

    (useStoreWithEqualityFn as jest.Mock).mockReturnValue(mockNodes);

    const { result } = renderHook(() =>
      useInputMinMax({
        nodeType: "nodetool.input.FloatInput",
        nodeId: "test-node",
        propertyName: "value",
        propertyMin: 0,
        propertyMax: 100,
      })
    );

    expect(result.current).toEqual({ min: 100, max: 200 });
  });

  it("uses defaults 0-100 when no bounds specified", () => {
    const { result } = renderHook(() =>
      useInputMinMax({
        nodeType: "nodetool.input.FloatInput",
        nodeId: "test-node",
        propertyName: "value",
        propertyMin: undefined,
        propertyMax: undefined,
      })
    );

    expect(result.current).toEqual({ min: 0, max: 100 });
  });

  it("handles null propertyMin/propertyMax", () => {
    const { result } = renderHook(() =>
      useInputMinMax({
        nodeType: "nodetool.input.FloatInput",
        nodeId: "test-node",
        propertyName: "value",
        propertyMin: null,
        propertyMax: null,
      })
    );

    expect(result.current).toEqual({ min: 0, max: 100 });
  });

  it("returns defaults when nodes array is empty", () => {
    (useStoreWithEqualityFn as jest.Mock).mockReturnValue([]);

    const { result } = renderHook(() =>
      useInputMinMax({
        nodeType: "nodetool.input.FloatInput",
        nodeId: "test-node",
        propertyName: "value",
        propertyMin: 5,
        propertyMax: 95,
      })
    );

    expect(result.current).toEqual({ min: 5, max: 95 });
  });

  it("returns defaults when node is not found", () => {
    (useStoreWithEqualityFn as jest.Mock).mockReturnValue([
      { id: "other-node", data: { properties: { min: 10, max: 20 } } },
    ]);

    const { result } = renderHook(() =>
      useInputMinMax({
        nodeType: "nodetool.input.FloatInput",
        nodeId: "test-node",
        propertyName: "value",
        propertyMin: 5,
        propertyMax: 95,
      })
    );

    expect(result.current).toEqual({ min: 5, max: 95 });
  });

  it("handles node with undefined properties", () => {
    const mockNodes = [
      {
        id: "test-node",
        data: {},
      },
    ];

    (useStoreWithEqualityFn as jest.Mock).mockReturnValue(mockNodes);

    const { result } = renderHook(() =>
      useInputMinMax({
        nodeType: "nodetool.input.FloatInput",
        nodeId: "test-node",
        propertyName: "value",
        propertyMin: 5,
        propertyMax: 95,
      })
    );

    expect(result.current).toEqual({ min: 5, max: 95 });
  });

  it("handles node with non-numeric properties", () => {
    const mockNodes = [
      {
        id: "test-node",
        data: {
          properties: {
            min: "invalid",
            max: null,
          },
        },
      },
    ];

    (useStoreWithEqualityFn as jest.Mock).mockReturnValue(mockNodes);

    const { result } = renderHook(() =>
      useInputMinMax({
        nodeType: "nodetool.input.FloatInput",
        nodeId: "test-node",
        propertyName: "value",
        propertyMin: 5,
        propertyMax: 95,
      })
    );

    expect(result.current).toEqual({ min: 5, max: 95 });
  });
});
