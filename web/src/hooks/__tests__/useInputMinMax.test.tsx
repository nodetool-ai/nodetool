import React from "react";
import { renderHook } from "@testing-library/react";
import { useInputMinMax } from "../useInputMinMax";
import { Node, Position } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";

jest.mock("../../contexts/NodeContext", () => ({
  NodeContext: {
    Provider: ({ children }: { children: React.ReactNode }) => children
  }
}));

jest.mock("zustand/traditional", () => ({
  useStoreWithEqualityFn: jest.fn()
}));

describe("useInputMinMax", () => {
  const createMockNode = (id: string, properties?: Record<string, unknown>): Node<NodeData> => ({
    id,
    type: "test",
    position: { x: 0, y: 0 },
    targetPosition: Position.Left,
    sourcePosition: Position.Right,
    data: {
      properties: properties || {},
      dynamic_properties: {},
      selectable: true,
      workflow_id: "test-workflow"
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Default Bounds", () => {
    it("returns default bounds 0-100 when no options provided", () => {
      const { result } = renderHook(() =>
        useInputMinMax({
          nodeId: "node-1",
          propertyName: "value"
        })
      );

      expect(result.current.min).toBe(0);
      expect(result.current.max).toBe(100);
    });

    it("returns default bounds when nodeType is not FloatInput or IntegerInput", () => {
      const { result } = renderHook(() =>
        useInputMinMax({
          nodeType: "nodetool.other.Type",
          nodeId: "node-1",
          propertyName: "value",
          propertyMin: 10,
          propertyMax: 90
        })
      );

      expect(result.current.min).toBe(10);
      expect(result.current.max).toBe(90);
    });

    it("uses propertyMin and propertyMax when provided", () => {
      const { result } = renderHook(() =>
        useInputMinMax({
          nodeType: "nodetool.input.FloatInput",
          nodeId: "node-1",
          propertyName: "value",
          propertyMin: 5,
          propertyMax: 50
        })
      );

      expect(result.current.min).toBe(5);
      expect(result.current.max).toBe(50);
    });
  });

  describe("Node Property Lookup", () => {
    it("looks up min/max from node properties for FloatInput", () => {
      const mockNodes = [
        createMockNode("node-1", { min: 20, max: 80 }),
        createMockNode("node-2", { min: 0, max: 50 })
      ];

      require("zustand/traditional").useStoreWithEqualityFn.mockReturnValue(mockNodes);

      const { result } = renderHook(() =>
        useInputMinMax({
          nodeType: "nodetool.input.FloatInput",
          nodeId: "node-1",
          propertyName: "value"
        })
      );

      expect(result.current.min).toBe(20);
      expect(result.current.max).toBe(80);
    });

    it("looks up min/max from node properties for IntegerInput", () => {
      require("zustand/traditional").useStoreWithEqualityFn.mockReturnValue([
        createMockNode("node-1", { min: 1, max: 10 })
      ]);

      const { result } = renderHook(() =>
        useInputMinMax({
          nodeType: "nodetool.input.IntegerInput",
          nodeId: "node-1",
          propertyName: "value"
        })
      );

      expect(result.current.min).toBe(1);
      expect(result.current.max).toBe(10);
    });

    it("prefers node properties over propertyMin/propertyMax", () => {
      require("zustand/traditional").useStoreWithEqualityFn.mockReturnValue([
        createMockNode("node-1", { min: 100, max: 200 })
      ]);

      const { result } = renderHook(() =>
        useInputMinMax({
          nodeType: "nodetool.input.FloatInput",
          nodeId: "node-1",
          propertyName: "value",
          propertyMin: 0,
          propertyMax: 50
        })
      );

      expect(result.current.min).toBe(100);
      expect(result.current.max).toBe(200);
    });

    it("falls back to propertyMin/propertyMax when node properties not set", () => {
      require("zustand/traditional").useStoreWithEqualityFn.mockReturnValue([
        createMockNode("node-1", {})
      ]);

      const { result } = renderHook(() =>
        useInputMinMax({
          nodeType: "nodetool.input.FloatInput",
          nodeId: "node-1",
          propertyName: "value",
          propertyMin: 25,
          propertyMax: 75
        })
      );

      expect(result.current.min).toBe(25);
      expect(result.current.max).toBe(75);
    });

    it("finds node by id in nodes array", () => {
      require("zustand/traditional").useStoreWithEqualityFn.mockReturnValue([
        createMockNode("other-node", { min: 10, max: 20 }),
        createMockNode("node-1", { min: 50, max: 100 })
      ]);

      const { result } = renderHook(() =>
        useInputMinMax({
          nodeType: "nodetool.input.FloatInput",
          nodeId: "node-1",
          propertyName: "value"
        })
      );

      expect(result.current.min).toBe(50);
      expect(result.current.max).toBe(100);
    });
  });

  describe("Non-Value Properties", () => {
    it("does not lookup bounds for non-value properties on FloatInput", () => {
      require("zustand/traditional").useStoreWithEqualityFn.mockReturnValue([
        createMockNode("node-1", { min: 100, max: 200 })
      ]);

      const { result } = renderHook(() =>
        useInputMinMax({
          nodeType: "nodetool.input.FloatInput",
          nodeId: "node-1",
          propertyName: "step"
        })
      );

      expect(result.current.min).toBe(0);
      expect(result.current.max).toBe(100);
    });

    it("uses propertyMin/propertyMax for non-value properties", () => {
      require("zustand/traditional").useStoreWithEqualityFn.mockReturnValue([
        createMockNode("node-1", { min: 100, max: 200 })
      ]);

      const { result } = renderHook(() =>
        useInputMinMax({
          nodeType: "nodetool.input.FloatInput",
          nodeId: "node-1",
          propertyName: "step",
          propertyMin: 10,
          propertyMax: 90
        })
      );

      expect(result.current.min).toBe(10);
      expect(result.current.max).toBe(90);
    });
  });

  describe("Edge Cases", () => {
    it("handles null propertyMin and propertyMax", () => {
      const { result } = renderHook(() =>
        useInputMinMax({
          nodeType: "nodetool.input.FloatInput",
          nodeId: "node-1",
          propertyName: "value",
          propertyMin: null,
          propertyMax: null
        })
      );

      expect(result.current.min).toBe(0);
      expect(result.current.max).toBe(100);
    });

    it("handles undefined propertyMin and propertyMax", () => {
      const { result } = renderHook(() =>
        useInputMinMax({
          nodeType: "nodetool.input.FloatInput",
          nodeId: "node-1",
          propertyName: "value",
          propertyMin: undefined,
          propertyMax: undefined
        })
      );

      expect(result.current.min).toBe(0);
      expect(result.current.max).toBe(100);
    });

    it("handles node not found in nodes array", () => {
      require("zustand/traditional").useStoreWithEqualityFn.mockReturnValue([
        createMockNode("other-node", { min: 50, max: 150 })
      ]);

      const { result } = renderHook(() =>
        useInputMinMax({
          nodeType: "nodetool.input.FloatInput",
          nodeId: "non-existent-node",
          propertyName: "value",
          propertyMin: 10,
          propertyMax: 90
        })
      );

      expect(result.current.min).toBe(10);
      expect(result.current.max).toBe(90);
    });

    it("handles empty nodes array", () => {
      require("zustand/traditional").useStoreWithEqualityFn.mockReturnValue([]);

      const { result } = renderHook(() =>
        useInputMinMax({
          nodeType: "nodetool.input.FloatInput",
          nodeId: "node-1",
          propertyName: "value",
          propertyMin: 5,
          propertyMax: 95
        })
      );

      expect(result.current.min).toBe(5);
      expect(result.current.max).toBe(95);
    });
  });

  describe("Other Node Types Fallback", () => {
    it("uses propertyMin/propertyMax for non-input nodes", () => {
      require("zustand/traditional").useStoreWithEqualityFn.mockReturnValue([
        createMockNode("node-1", { min: 100, max: 200 })
      ]);

      const { result } = renderHook(() =>
        useInputMinMax({
          nodeType: "nodetool.process.CustomNode",
          nodeId: "node-1",
          propertyName: "value",
          propertyMin: 10,
          propertyMax: 90
        })
      );

      expect(result.current.min).toBe(10);
      expect(result.current.max).toBe(90);
    });
  });
});
