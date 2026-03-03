/**
 * PinnedNodesStore tests
 */

import { renderHook, act } from "@testing-library/react";
import { usePinnedNodesStore } from "../PinnedNodesStore";

describe("PinnedNodesStore", () => {
  beforeEach(() => {
    // Reset the store before each test
    const { result } = renderHook(() => usePinnedNodesStore());
    act(() => {
      result.current.clearAllPins();
    });
  });

  describe("togglePin", () => {
    it("should add a node to pinned nodes when not already pinned", () => {
      const { result } = renderHook(() => usePinnedNodesStore());

      act(() => {
        result.current.togglePin("workflow-1", "node-1", "nodetool.image.Generate");
      });

      expect(result.current.isPinned("workflow-1", "node-1")).toBe(true);
      expect(result.current.getAllPinnedNodes()).toHaveLength(1);
    });

    it("should remove a node from pinned nodes when already pinned", () => {
      const { result } = renderHook(() => usePinnedNodesStore());

      act(() => {
        result.current.togglePin("workflow-1", "node-1", "nodetool.image.Generate");
      });

      expect(result.current.isPinned("workflow-1", "node-1")).toBe(true);

      act(() => {
        result.current.togglePin("workflow-1", "node-1", "nodetool.image.Generate");
      });

      expect(result.current.isPinned("workflow-1", "node-1")).toBe(false);
      expect(result.current.getAllPinnedNodes()).toHaveLength(0);
    });

    it("should store custom label when provided", () => {
      const { result } = renderHook(() => usePinnedNodesStore());

      act(() => {
        result.current.togglePin(
          "workflow-1",
          "node-1",
          "nodetool.image.Generate",
          "My Custom Label"
        );
      });

      const pinnedNodes = result.current.getAllPinnedNodes();
      expect(pinnedNodes).toHaveLength(1);
      expect(pinnedNodes[0].label).toBe("My Custom Label");
    });

    it("should enforce max pinned nodes per workflow", () => {
      const { result } = renderHook(() => usePinnedNodesStore());

      // Pin more than MAX_PINNED_NODES (20) nodes
      act(() => {
        for (let i = 0; i < 25; i++) {
          result.current.togglePin(
            "workflow-1",
            `node-${i}`,
            `nodetool.node.Type${i}`,
            `Node ${i}`
          );
        }
      });

      const workflowPins = result.current.getPinnedNodesForWorkflow("workflow-1");
      expect(workflowPins.length).toBe(20);

      // The 5 oldest pins (node-0 through node-4) should have been removed
      expect(workflowPins.some((pin) => pin.nodeId === "node-0")).toBe(false);
      expect(workflowPins.some((pin) => pin.nodeId === "node-4")).toBe(false);
      // The 20 newest pins (node-5 through node-24) should remain
      expect(workflowPins.some((pin) => pin.nodeId === "node-5")).toBe(true);
      expect(workflowPins.some((pin) => pin.nodeId === "node-24")).toBe(true);
    });

    it("should not affect pins from other workflows", () => {
      const { result } = renderHook(() => usePinnedNodesStore());

      act(() => {
        result.current.togglePin("workflow-1", "node-1", "nodetool.image.Generate");
        result.current.togglePin("workflow-2", "node-2", "nodetool.image.Generate");
      });

      expect(result.current.isPinned("workflow-1", "node-1")).toBe(true);
      expect(result.current.isPinned("workflow-2", "node-2")).toBe(true);

      // Remove node from workflow-1
      act(() => {
        result.current.togglePin("workflow-1", "node-1", "nodetool.image.Generate");
      });

      expect(result.current.isPinned("workflow-1", "node-1")).toBe(false);
      expect(result.current.isPinned("workflow-2", "node-2")).toBe(true);
    });
  });

  describe("isPinned", () => {
    it("should return false for non-existent pins", () => {
      const { result } = renderHook(() => usePinnedNodesStore());

      expect(result.current.isPinned("workflow-1", "node-1")).toBe(false);
    });

    it("should return true for pinned nodes", () => {
      const { result } = renderHook(() => usePinnedNodesStore());

      act(() => {
        result.current.togglePin("workflow-1", "node-1", "nodetool.image.Generate");
      });

      expect(result.current.isPinned("workflow-1", "node-1")).toBe(true);
    });

    it("should distinguish between different workflows", () => {
      const { result } = renderHook(() => usePinnedNodesStore());

      act(() => {
        result.current.togglePin("workflow-1", "node-1", "nodetool.image.Generate");
      });

      expect(result.current.isPinned("workflow-1", "node-1")).toBe(true);
      expect(result.current.isPinned("workflow-2", "node-1")).toBe(false);
    });
  });

  describe("getPinnedNodesForWorkflow", () => {
    it("should return empty array for workflow with no pins", () => {
      const { result } = renderHook(() => usePinnedNodesStore());

      const pins = result.current.getPinnedNodesForWorkflow("workflow-1");
      expect(pins).toEqual([]);
    });

    it("should return only pins for the specified workflow", () => {
      const { result } = renderHook(() => usePinnedNodesStore());

      act(() => {
        result.current.togglePin("workflow-1", "node-1", "nodetool.image.Generate");
        result.current.togglePin("workflow-1", "node-2", "nodetool.image.Generate");
        result.current.togglePin("workflow-2", "node-3", "nodetool.image.Generate");
      });

      const workflow1Pins = result.current.getPinnedNodesForWorkflow("workflow-1");
      const workflow2Pins = result.current.getPinnedNodesForWorkflow("workflow-2");

      expect(workflow1Pins).toHaveLength(2);
      expect(workflow2Pins).toHaveLength(1);
    });

    it("should return pins sorted by timestamp (newest first)", () => {
      const { result } = renderHook(() => usePinnedNodesStore());

      act(() => {
        result.current.togglePin("workflow-1", "node-1", "nodetool.image.Generate");
        // Add a small delay to ensure different timestamps
        jest.advanceTimersByTime(10);
        result.current.togglePin("workflow-1", "node-2", "nodetool.image.Generate");
        jest.advanceTimersByTime(10);
        result.current.togglePin("workflow-1", "node-3", "nodetool.image.Generate");
      });

      const pins = result.current.getPinnedNodesForWorkflow("workflow-1");
      expect(pins).toHaveLength(3);
      // Newest should be first
      expect(pins[0].nodeId).toBe("node-3");
      expect(pins[1].nodeId).toBe("node-2");
      expect(pins[2].nodeId).toBe("node-1");
    });
  });

  describe("unpinNode", () => {
    it("should remove the specified node from pins", () => {
      const { result } = renderHook(() => usePinnedNodesStore());

      act(() => {
        result.current.togglePin("workflow-1", "node-1", "nodetool.image.Generate");
        result.current.togglePin("workflow-1", "node-2", "nodetool.image.Generate");
      });

      expect(result.current.isPinned("workflow-1", "node-1")).toBe(true);
      expect(result.current.isPinned("workflow-1", "node-2")).toBe(true);

      act(() => {
        result.current.unpinNode("workflow-1", "node-1");
      });

      expect(result.current.isPinned("workflow-1", "node-1")).toBe(false);
      expect(result.current.isPinned("workflow-1", "node-2")).toBe(true);
    });

    it("should do nothing when unpinning a non-pinned node", () => {
      const { result } = renderHook(() => usePinnedNodesStore());

      expect(() => {
        act(() => {
          result.current.unpinNode("workflow-1", "node-1");
        });
      }).not.toThrow();

      expect(result.current.getAllPinnedNodes()).toHaveLength(0);
    });
  });

  describe("clearAllPins", () => {
    it("should remove all pinned nodes", () => {
      const { result } = renderHook(() => usePinnedNodesStore());

      act(() => {
        result.current.togglePin("workflow-1", "node-1", "nodetool.image.Generate");
        result.current.togglePin("workflow-2", "node-2", "nodetool.image.Generate");
      });

      expect(result.current.getAllPinnedNodes()).toHaveLength(2);

      act(() => {
        result.current.clearAllPins();
      });

      expect(result.current.getAllPinnedNodes()).toHaveLength(0);
    });
  });

  describe("getAllPinnedNodes", () => {
    it("should return all pinned nodes across all workflows", () => {
      const { result } = renderHook(() => usePinnedNodesStore());

      act(() => {
        result.current.togglePin("workflow-1", "node-1", "nodetool.image.Generate");
        result.current.togglePin("workflow-2", "node-2", "nodetool.image.Generate");
      });

      const allPins = result.current.getAllPinnedNodes();
      expect(allPins).toHaveLength(2);
    });
  });
});
