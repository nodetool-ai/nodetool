import { renderHook, act, cleanup } from "@testing-library/react";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "../NodeData";
import useClipboardHistoryStore from "../ClipboardHistoryStore";

describe("ClipboardHistoryStore", () => {
  const createMockNodes = (idSuffix: string, count: number): Node<NodeData>[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `node-${idSuffix}-${i}`,
      type: "testNode",
      position: { x: 100 + i * 50, y: 100 + i * 50 },
      data: {
        properties: {},
        selectable: true,
        dynamic_properties: {},
        workflow_id: "test-workflow"
      } as NodeData,
      selected: false,
      dragging: false,
      targetPosition: "right" as const,
      sourcePosition: "left" as const
    }));
  };

  beforeEach(() => {
    cleanup();
    localStorage.clear();
    act(() => {
      useClipboardHistoryStore.setState({ history: [] });
    });
  });

  afterEach(() => {
    act(() => {
      useClipboardHistoryStore.setState({ history: [] });
    });
    localStorage.clear();
  });

  describe("addItem", () => {
    it("should add a new item to empty history", () => {
      const { result } = renderHook(() => useClipboardHistoryStore());

      const nodes = createMockNodes("test1", 2);
      const edges: Edge[] = [];

      act(() => {
        result.current.addItem({ nodes, edges });
      });

      expect(result.current.history).toHaveLength(1);
      expect(result.current.history[0].nodeCount).toBe(2);
    });

    it("should add multiple items to history", () => {
      const { result } = renderHook(() => useClipboardHistoryStore());

      const nodes1 = createMockNodes("test2a", 1);
      const nodes2 = createMockNodes("test2b", 2);
      const nodes3 = createMockNodes("test2c", 3);

      act(() => {
        result.current.addItem({ nodes: nodes1, edges: [] });
        result.current.addItem({ nodes: nodes2, edges: [] });
        result.current.addItem({ nodes: nodes3, edges: [] });
      });

      expect(result.current.history).toHaveLength(3);
      expect(result.current.history[0].nodeCount).toBe(3);
      expect(result.current.history[1].nodeCount).toBe(2);
      expect(result.current.history[2].nodeCount).toBe(1);
    });

    it("should limit history to max size of 10", () => {
      const { result } = renderHook(() => useClipboardHistoryStore());

      for (let i = 0; i < 12; i++) {
        act(() => {
          result.current.addItem({
            nodes: createMockNodes(`limit-${i}`, 1),
            edges: []
          });
        });
      }

      expect(result.current.history.length).toBeLessThanOrEqual(10);
    });

    it("should generate preview nodes from copied nodes", () => {
      const { result } = renderHook(() => useClipboardHistoryStore());

      const nodes: Node<NodeData>[] = [
        {
          id: `node-text-${Date.now()}`,
          type: "textInput",
          position: { x: 100, y: 100 },
          data: {
            title: "Text Input Node",
            properties: {},
            selectable: true,
            dynamic_properties: {},
            workflow_id: "test"
          } as NodeData,
          selected: false,
          dragging: false,
          targetPosition: "right" as const,
          sourcePosition: "left" as const
        },
        {
          id: `node-llm-${Date.now()}`,
          type: "llm",
          position: { x: 200, y: 200 },
          data: {
            name: "LLM Node",
            properties: {},
            selectable: true,
            dynamic_properties: {},
            workflow_id: "test"
          } as NodeData,
          selected: false,
          dragging: false,
          targetPosition: "right" as const,
          sourcePosition: "left" as const
        }
      ];

      act(() => {
        result.current.addItem({ nodes, edges: [] });
      });

      expect(result.current.history[0].previewNodes).toHaveLength(2);
      expect(result.current.history[0].previewNodes[0].label).toBe(
        "Text Input Node"
      );
      expect(result.current.history[0].previewNodes[1].label).toBe("LLM Node");
    });

    it("should limit preview nodes to 3", () => {
      const { result } = renderHook(() => useClipboardHistoryStore());

      const nodes = createMockNodes("preview-limit", 5);

      act(() => {
        result.current.addItem({ nodes, edges: [] });
      });

      expect(result.current.history[0].previewNodes).toHaveLength(3);
    });
  });

  describe("removeItem", () => {
    it("should remove item by ID", () => {
      const { result } = renderHook(() => useClipboardHistoryStore());

      const nodes1 = createMockNodes("remove1a", 1);
      const nodes2 = createMockNodes("remove1b", 2);

      act(() => {
        result.current.addItem({ nodes: nodes1, edges: [] });
        result.current.addItem({ nodes: nodes2, edges: [] });
      });

      const firstItemId = result.current.history[0].id;
      act(() => {
        result.current.removeItem(firstItemId);
      });

      expect(result.current.history).toHaveLength(1);
      expect(result.current.history[0].nodeCount).toBe(2);
    });

    it("should handle removing non-existent item", () => {
      const { result } = renderHook(() => useClipboardHistoryStore());

      const nodes = createMockNodes("remove-none", 1);

      act(() => {
        result.current.addItem({ nodes, edges: [] });
      });

      act(() => {
        result.current.removeItem("non-existent-id");
      });

      expect(result.current.history).toHaveLength(1);
    });
  });

  describe("clearHistory", () => {
    it("should clear all items", () => {
      const { result } = renderHook(() => useClipboardHistoryStore());

      act(() => {
        result.current.addItem({
          nodes: createMockNodes("clear", 1),
          edges: []
        });
      });

      expect(result.current.history.length).toBeGreaterThanOrEqual(1);

      act(() => {
        result.current.clearHistory();
      });

      expect(result.current.history).toHaveLength(0);
    });
  });

  describe("getItem", () => {
    it("should return item by ID", () => {
      const { result } = renderHook(() => useClipboardHistoryStore());

      const nodes = createMockNodes("get-item", 1);

      act(() => {
        result.current.addItem({ nodes, edges: [] });
      });

      const itemId = result.current.history[0].id;
      const item = result.current.getItem(itemId);

      expect(item).toBeDefined();
      expect(item?.nodeCount).toBe(1);
    });

    it("should return undefined for non-existent ID", () => {
      const { result } = renderHook(() => useClipboardHistoryStore());

      const item = result.current.getItem("non-existent-id");

      expect(item).toBeUndefined();
    });
  });

  describe("maxHistorySize", () => {
    it("should have correct max history size", () => {
      const { result } = renderHook(() => useClipboardHistoryStore());

      expect(result.current.maxHistorySize).toBe(10);
    });
  });
});
