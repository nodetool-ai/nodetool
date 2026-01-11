import { renderHook } from "@testing-library/react";
import { useVirtualizedNodes, NODE_ITEM_HEIGHT, NODE_ITEM_OVERSCAN } from "../useVirtualizedNodes";

const createMockNodes = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    node_type: `node-${i}`,
    name: `Node ${i}`,
    namespace: `namespace${i % 3}`,
    description: "Test node",
    input_types: [],
    output_types: [],
    display_type: "test",
    icon: null,
    default_values: {},
    expose_as_tool: false,
    tags: [],
    title: `Node ${i}`,
    layout: { h: 1, w: 1, x: 0, y: 0 },
    properties: {},
    outputs: []
  }));

describe("useVirtualizedNodes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("basic functionality", () => {
    it("returns virtualizer and container ref", () => {
      const nodes = createMockNodes(5);

      const { result } = renderHook(() =>
        useVirtualizedNodes({ nodes, enabled: true })
      );

      expect(result.current.containerRef).toBeDefined();
      expect(result.current.isVirtualized).toBe(false);
    });

    it("does not virtualize when node count is below threshold", () => {
      const nodes = createMockNodes(10);

      const { result } = renderHook(() =>
        useVirtualizedNodes({ nodes, enabled: true })
      );

      expect(result.current.isVirtualized).toBe(false);
      expect(result.current.virtualizer).toBeNull();
      expect(result.current.virtualItems).toEqual([]);
    });

    it("virtualizes when node count exceeds threshold", () => {
      const nodes = createMockNodes(50);

      const { result } = renderHook(() =>
        useVirtualizedNodes({ nodes, enabled: true })
      );

      expect(result.current.isVirtualized).toBe(true);
      expect(result.current.virtualizer).not.toBeNull();
    });
  });

  describe("options", () => {
    it("uses custom estimateSize", () => {
      const nodes = createMockNodes(50);
      const customEstimate = 100;

      const { result } = renderHook(() =>
        useVirtualizedNodes({ nodes, estimateSize: customEstimate, enabled: true })
      );

      expect(result.current.isVirtualized).toBe(true);
    });

    it("uses custom overscan", () => {
      const nodes = createMockNodes(50);

      const { result } = renderHook(() =>
        useVirtualizedNodes({ nodes, overscan: 10, enabled: true })
      );

      expect(result.current.isVirtualized).toBe(true);
    });

    it("disables virtualization when enabled is false", () => {
      const nodes = createMockNodes(100);

      const { result } = renderHook(() =>
        useVirtualizedNodes({ nodes, enabled: false })
      );

      expect(result.current.isVirtualized).toBe(false);
    });
  });

  describe("totalSize calculation", () => {
    it("calculates total size based on estimate when not virtualized", () => {
      const nodes = createMockNodes(10);
      const estimateSize = NODE_ITEM_HEIGHT;

      const { result } = renderHook(() =>
        useVirtualizedNodes({ nodes, enabled: false })
      );

      expect(result.current.totalSize).toBe(nodes.length * estimateSize);
    });

    it("updates when nodes change", () => {
      const { result, rerender } = renderHook(
        ({ nodes }: { nodes: ReturnType<typeof createMockNodes> }) =>
          useVirtualizedNodes({ nodes, enabled: false }),
        { initialProps: { nodes: createMockNodes(5) } }
      );

      const initialSize = result.current.totalSize;

      rerender({ nodes: createMockNodes(10) });

      expect(result.current.totalSize).toBeGreaterThan(initialSize);
    });
  });

  describe("constants", () => {
    it("exports correct NODE_ITEM_HEIGHT", () => {
      expect(NODE_ITEM_HEIGHT).toBe(48);
    });

    it("exports correct NODE_ITEM_OVERSCAN", () => {
      expect(NODE_ITEM_OVERSCAN).toBe(5);
    });

    it("exports useVirtualizedNodes function", () => {
      expect(useVirtualizedNodes).toBeDefined();
      expect(typeof useVirtualizedNodes).toBe("function");
    });
  });
});
