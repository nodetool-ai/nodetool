import { useNodeFocusStore } from "../NodeFocusStore";
import { Node, Position } from "@xyflow/react";
import { NodeData } from "../NodeData";

const createMockNode = (id: string, x: number = 0, y: number = 0): Node<NodeData> => ({
  id,
  type: "test",
  position: { x, y },
  targetPosition: Position.Left,
  sourcePosition: Position.Right,
  data: {
    properties: {},
    dynamic_properties: {},
    selectable: true,
    workflow_id: "test",
  },
});

describe("NodeFocusStore", () => {
  beforeEach(() => {
    useNodeFocusStore.setState(useNodeFocusStore.getInitialState());
  });

  afterEach(() => {
    useNodeFocusStore.setState(useNodeFocusStore.getInitialState());
  });

  describe("initial state", () => {
    it("should have correct default values", () => {
      const state = useNodeFocusStore.getState();
      expect(state.focusedNodeId).toBe(null);
      expect(state.isNavigationMode).toBe(false);
      expect(state.focusHistory).toEqual([]);
    });
  });

  describe("setFocusedNode", () => {
    it("should set focused node id", () => {
      useNodeFocusStore.getState().setFocusedNode("node-1");
      expect(useNodeFocusStore.getState().focusedNodeId).toBe("node-1");
    });

    it("should clear focused node when null is passed", () => {
      useNodeFocusStore.getState().setFocusedNode("node-1");
      useNodeFocusStore.getState().setFocusedNode(null);
      expect(useNodeFocusStore.getState().focusedNodeId).toBe(null);
    });

    it("should add to focus history", () => {
      useNodeFocusStore.getState().setFocusedNode("node-1");
      useNodeFocusStore.getState().setFocusedNode("node-2");
      expect(useNodeFocusStore.getState().focusHistory).toContain("node-1");
      expect(useNodeFocusStore.getState().focusHistory).toContain("node-2");
    });

    it("should limit focus history to 20 entries", () => {
      for (let i = 0; i < 25; i++) {
        useNodeFocusStore.getState().setFocusedNode(`node-${i}`);
      }
      const history = useNodeFocusStore.getState().focusHistory;
      expect(history.length).toBe(20);
      expect(history[0]).toBe("node-5");
    });

    it("should not add duplicate consecutive nodes to history", () => {
      useNodeFocusStore.getState().setFocusedNode("node-1");
      useNodeFocusStore.getState().setFocusedNode("node-1");
      const history = useNodeFocusStore.getState().focusHistory;
      const occurrences = history.filter(id => id === "node-1").length;
      expect(occurrences).toBe(1);
    });
  });

  describe("enterNavigationMode", () => {
    it("should enter navigation mode", () => {
      useNodeFocusStore.getState().enterNavigationMode();
      expect(useNodeFocusStore.getState().isNavigationMode).toBe(true);
    });

    it("should not change state if already in navigation mode", () => {
      useNodeFocusStore.getState().enterNavigationMode();
      useNodeFocusStore.getState().enterNavigationMode();
      expect(useNodeFocusStore.getState().isNavigationMode).toBe(true);
    });
  });

  describe("exitNavigationMode", () => {
    it("should exit navigation mode", () => {
      useNodeFocusStore.getState().enterNavigationMode();
      useNodeFocusStore.getState().exitNavigationMode();
      expect(useNodeFocusStore.getState().isNavigationMode).toBe(false);
    });
  });

  describe("navigateFocus", () => {
    it("should navigate to next node", () => {
      const nodes = [
        createMockNode("node-1"),
        createMockNode("node-2"),
        createMockNode("node-3"),
      ];
      useNodeFocusStore.getState().setFocusedNode("node-1");
      useNodeFocusStore.getState().navigateFocus("next", nodes);
      expect(useNodeFocusStore.getState().focusedNodeId).toBe("node-2");
    });

    it("should navigate to previous node", () => {
      const nodes = [
        createMockNode("node-1"),
        createMockNode("node-2"),
        createMockNode("node-3"),
      ];
      useNodeFocusStore.getState().setFocusedNode("node-2");
      useNodeFocusStore.getState().navigateFocus("prev", nodes);
      expect(useNodeFocusStore.getState().focusedNodeId).toBe("node-1");
    });

    it("should wrap around when navigating next from last node", () => {
      const nodes = [
        createMockNode("node-1"),
        createMockNode("node-2"),
      ];
      useNodeFocusStore.getState().setFocusedNode("node-2");
      useNodeFocusStore.getState().navigateFocus("next", nodes);
      expect(useNodeFocusStore.getState().focusedNodeId).toBe("node-1");
    });

    it("should wrap around when navigating prev from first node", () => {
      const nodes = [
        createMockNode("node-1"),
        createMockNode("node-2"),
      ];
      useNodeFocusStore.getState().setFocusedNode("node-1");
      useNodeFocusStore.getState().navigateFocus("prev", nodes);
      expect(useNodeFocusStore.getState().focusedNodeId).toBe("node-2");
    });

    it("should navigate up", () => {
      const nodes = [
        createMockNode("node-1", 0, 100),
        createMockNode("node-2", 0, 50),
      ];
      useNodeFocusStore.getState().setFocusedNode("node-1");
      useNodeFocusStore.getState().navigateFocus("up", nodes);
      expect(useNodeFocusStore.getState().focusedNodeId).toBe("node-2");
    });

    it("should navigate down", () => {
      const nodes = [
        createMockNode("node-1", 0, 50),
        createMockNode("node-2", 0, 100),
      ];
      useNodeFocusStore.getState().setFocusedNode("node-1");
      useNodeFocusStore.getState().navigateFocus("down", nodes);
      expect(useNodeFocusStore.getState().focusedNodeId).toBe("node-2");
    });

    it("should navigate left", () => {
      const nodes = [
        createMockNode("node-1", 100, 0),
        createMockNode("node-2", 50, 0),
      ];
      useNodeFocusStore.getState().setFocusedNode("node-1");
      useNodeFocusStore.getState().navigateFocus("left", nodes);
      expect(useNodeFocusStore.getState().focusedNodeId).toBe("node-2");
    });

    it("should navigate right", () => {
      const nodes = [
        createMockNode("node-1", 50, 0),
        createMockNode("node-2", 100, 0),
      ];
      useNodeFocusStore.getState().setFocusedNode("node-1");
      useNodeFocusStore.getState().navigateFocus("right", nodes);
      expect(useNodeFocusStore.getState().focusedNodeId).toBe("node-2");
    });

    it("should do nothing when nodes array is empty", () => {
      useNodeFocusStore.getState().setFocusedNode("node-1");
      useNodeFocusStore.getState().navigateFocus("next", []);
      expect(useNodeFocusStore.getState().focusedNodeId).toBe("node-1");
    });

    it("should select first node when no node focused and navigating directionally", () => {
      const nodes = [
        createMockNode("node-1", 0, 100),
        createMockNode("node-2", 0, 50),
      ];
      useNodeFocusStore.getState().navigateFocus("up", nodes);
      expect(useNodeFocusStore.getState().focusedNodeId).toBe("node-1");
    });
  });

  describe("clearFocusHistory", () => {
    it("should clear focus history", () => {
      useNodeFocusStore.getState().setFocusedNode("node-1");
      useNodeFocusStore.getState().setFocusedNode("node-2");
      useNodeFocusStore.getState().clearFocusHistory();
      expect(useNodeFocusStore.getState().focusHistory).toEqual([]);
    });

    it("should not clear focused node", () => {
      useNodeFocusStore.getState().setFocusedNode("node-1");
      useNodeFocusStore.getState().clearFocusHistory();
      expect(useNodeFocusStore.getState().focusedNodeId).toBe("node-1");
    });
  });
});
