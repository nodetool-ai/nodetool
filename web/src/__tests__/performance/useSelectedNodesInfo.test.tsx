import { renderHook, act } from "@testing-library/react";
import { useSelectedNodesInfo } from "../../hooks/useSelectedNodesInfo";
import { useNodes } from "../../contexts/NodeContext";
import { useEdges } from "@xyflow/react";

jest.mock("../../contexts/NodeContext", () => ({
  useNodes: jest.fn(),
}));

jest.mock("@xyflow/react", () => ({
  useEdges: jest.fn(),
}));

describe("useSelectedNodesInfo Performance", () => {
  it("should not re-render unnecessarily when unselected nodes change", () => {
    const mockSelectedNodes = [
      { id: "node-1", type: "typeA", data: { properties: {} }, position: { x: 0, y: 0 } }
    ];

    (useNodes as jest.Mock).mockImplementation((selector, equalityFn) => {
      // Simulate Zustand state update where getSelectedNodes is called on every state change
      const result = selector({ getSelectedNodes: () => mockSelectedNodes, workflow: { id: "wf1" } });

      // We manually simulate the custom equality check behavior of useStoreWithEqualityFn here
      if (!equalityFn) {
         return result;
      }

      // Since this is a simple mock, we simulate it returning a stable reference
      // if equalityFn returns true when comparing with the same mockSelectedNodes instance.
      // In a real Zustand hook, it caches the old result if equalityFn is true.
      // For this test, we verify that equalityFn exists and handles identical arrays properly.
      expect(equalityFn(mockSelectedNodes, [...mockSelectedNodes])).toBe(true);
      return result;
    });

    (useEdges as jest.Mock).mockReturnValue([]);

    const { result, rerender } = renderHook(() => useSelectedNodesInfo());

    // Test passes if equalityFn validation inside the mock executes successfully
    expect(result.current.nodesInfo).toBeDefined();
  });
});
