import { renderHook, act } from "@testing-library/react";
import useEdgeInsertionStore from "../EdgeInsertionStore";

describe("EdgeInsertionStore", () => {
  beforeEach(() => {
    useEdgeInsertionStore.setState({
      targetEdge: null,
      insertPosition: null
    });
  });

  describe("initial state", () => {
    it("starts with null target edge", () => {
      const { result } = renderHook(() => useEdgeInsertionStore());
      expect(result.current.targetEdge).toBeNull();
    });

    it("starts with null insert position", () => {
      const { result } = renderHook(() => useEdgeInsertionStore());
      expect(result.current.insertPosition).toBeNull();
    });
  });

  describe("startInsertion", () => {
    it("sets target edge and position", () => {
      const { result } = renderHook(() => useEdgeInsertionStore());
      const mockEdge = {
        id: "edge-1",
        source: "node-a",
        target: "node-b",
        sourceHandle: "output",
        targetHandle: "input"
      };
      const position = { x: 100, y: 200 };

      act(() => {
        result.current.startInsertion(mockEdge, position);
      });

      expect(result.current.targetEdge).toEqual(mockEdge);
      expect(result.current.insertPosition).toEqual(position);
    });

    it("isInsertionMode returns true when in insertion mode", () => {
      const { result } = renderHook(() => useEdgeInsertionStore());
      const mockEdge = {
        id: "edge-1",
        source: "node-a",
        target: "node-b",
        sourceHandle: null,
        targetHandle: null
      };

      act(() => {
        result.current.startInsertion(mockEdge, { x: 50, y: 100 });
      });

      expect(result.current.isInsertionMode()).toBe(true);
    });
  });

  describe("cancelInsertion", () => {
    it("clears target edge and position", () => {
      const { result } = renderHook(() => useEdgeInsertionStore());

      const mockEdge = {
        id: "edge-1",
        source: "node-a",
        target: "node-b",
        sourceHandle: "output",
        targetHandle: "input"
      };

      act(() => {
        result.current.startInsertion(mockEdge, { x: 100, y: 200 });
        result.current.cancelInsertion();
      });

      expect(result.current.targetEdge).toBeNull();
      expect(result.current.insertPosition).toBeNull();
    });

    it("isInsertionMode returns false after cancellation", () => {
      const { result } = renderHook(() => useEdgeInsertionStore());

      const mockEdge = {
        id: "edge-1",
        source: "node-a",
        target: "node-b",
        sourceHandle: null,
        targetHandle: null
      };

      act(() => {
        result.current.startInsertion(mockEdge, { x: 50, y: 100 });
        result.current.cancelInsertion();
      });

      expect(result.current.isInsertionMode()).toBe(false);
    });
  });

  describe("isInsertionMode", () => {
    it("returns false when targetEdge is null", () => {
      const { result } = renderHook(() => useEdgeInsertionStore());
      expect(result.current.isInsertionMode()).toBe(false);
    });

    it("returns true when targetEdge is set", () => {
      const { result } = renderHook(() => useEdgeInsertionStore());

      act(() => {
        result.current.startInsertion(
          { id: "test", source: "a", target: "b", sourceHandle: null, targetHandle: null },
          { x: 0, y: 0 }
        );
      });

      expect(result.current.isInsertionMode()).toBe(true);
    });
  });
});
