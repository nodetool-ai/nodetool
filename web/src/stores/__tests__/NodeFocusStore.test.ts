import { Node } from "@xyflow/react";
import { NodeData } from "../NodeData";
import { useNodeFocusStore } from "../NodeFocusStore";

const createMockNode = (id: string, x: number = 0, y: number = 0): Node<NodeData> => ({
  id,
  type: "default",
  position: { x, y },
  data: {
    properties: {},
    dynamic_properties: {},
    selectable: true,
    workflow_id: "test-workflow"
  }
});

describe("NodeFocusStore", () => {
  beforeEach(() => {
    useNodeFocusStore.setState({
      focusedNodeId: null,
      isNavigationMode: false,
      focusHistory: []
    });
  });

  describe("initial state", () => {
    it("should initialize with null focusedNodeId", () => {
      expect(useNodeFocusStore.getState().focusedNodeId).toBeNull();
    });

    it("should initialize with navigation mode off", () => {
      expect(useNodeFocusStore.getState().isNavigationMode).toBe(false);
    });

    it("should initialize with empty focusHistory", () => {
      expect(useNodeFocusStore.getState().focusHistory).toEqual([]);
    });
  });

  describe("setFocusedNode", () => {
    it("should set focused node", () => {
      useNodeFocusStore.getState().setFocusedNode("node-1");

      expect(useNodeFocusStore.getState().focusedNodeId).toBe("node-1");
    });

    it("should add node to focus history", () => {
      useNodeFocusStore.getState().setFocusedNode("node-1");

      expect(useNodeFocusStore.getState().focusHistory).toContain("node-1");
    });

    it("should not add duplicate to history when same node is focused", () => {
      useNodeFocusStore.getState().setFocusedNode("node-1");
      useNodeFocusStore.getState().setFocusedNode("node-1");

      const history = useNodeFocusStore.getState().focusHistory;
      const count = history.filter(id => id === "node-1").length;
      expect(count).toBe(1);
    });

    it("should add multiple nodes to history", () => {
      useNodeFocusStore.getState().setFocusedNode("node-1");
      useNodeFocusStore.getState().setFocusedNode("node-2");
      useNodeFocusStore.getState().setFocusedNode("node-3");

      const history = useNodeFocusStore.getState().focusHistory;
      expect(history).toEqual(["node-1", "node-2", "node-3"]);
    });

    it("should clear focus when null is set", () => {
      useNodeFocusStore.getState().setFocusedNode("node-1");
      useNodeFocusStore.getState().setFocusedNode(null);

      expect(useNodeFocusStore.getState().focusedNodeId).toBeNull();
    });

    it("should not clear history when setting null", () => {
      useNodeFocusStore.getState().setFocusedNode("node-1");
      useNodeFocusStore.getState().setFocusedNode(null);

      expect(useNodeFocusStore.getState().focusHistory).toContain("node-1");
    });

    it("should limit history to last 20 entries", () => {
      for (let i = 0; i < 25; i++) {
        useNodeFocusStore.getState().setFocusedNode(`node-${i}`);
      }

      const history = useNodeFocusStore.getState().focusHistory;
      expect(history).toHaveLength(20);
      expect(history[0]).toBe("node-5");
      expect(history[19]).toBe("node-24");
    });
  });

  describe("enterNavigationMode", () => {
    it("should enter navigation mode", () => {
      useNodeFocusStore.getState().enterNavigationMode();

      expect(useNodeFocusStore.getState().isNavigationMode).toBe(true);
    });

    it("should preserve focusedNodeId when entering navigation mode", () => {
      useNodeFocusStore.getState().setFocusedNode("node-1");
      useNodeFocusStore.getState().enterNavigationMode();

      expect(useNodeFocusStore.getState().focusedNodeId).toBe("node-1");
      expect(useNodeFocusStore.getState().isNavigationMode).toBe(true);
    });

    it("should not change state if already in navigation mode", () => {
      useNodeFocusStore.getState().enterNavigationMode();
      const initialFocusedId = useNodeFocusStore.getState().focusedNodeId;

      useNodeFocusStore.getState().enterNavigationMode();

      expect(useNodeFocusStore.getState().focusedNodeId).toBe(initialFocusedId);
    });
  });

  describe("exitNavigationMode", () => {
    it("should exit navigation mode", () => {
      useNodeFocusStore.getState().enterNavigationMode();
      expect(useNodeFocusStore.getState().isNavigationMode).toBe(true);

      useNodeFocusStore.getState().exitNavigationMode();
      expect(useNodeFocusStore.getState().isNavigationMode).toBe(false);
    });

    it("should not clear focusedNodeId when exiting navigation mode", () => {
      useNodeFocusStore.getState().setFocusedNode("node-1");
      useNodeFocusStore.getState().enterNavigationMode();

      useNodeFocusStore.getState().exitNavigationMode();

      expect(useNodeFocusStore.getState().focusedNodeId).toBe("node-1");
    });
  });

  describe("navigateFocus", () => {
    const nodes = [
      createMockNode("node-1", 0, 0),
      createMockNode("node-2", 100, 0),
      createMockNode("node-3", 0, 100),
      createMockNode("node-4", 100, 100)
    ];

    it("should not change state with empty nodes array", () => {
      useNodeFocusStore.getState().navigateFocus("next", []);
      expect(useNodeFocusStore.getState().focusedNodeId).toBeNull();
    });

    describe("next/prev navigation", () => {
      it("should navigate to next node", () => {
        useNodeFocusStore.getState().navigateFocus("next", nodes);

        expect(useNodeFocusStore.getState().focusedNodeId).toBe("node-1");
      });

      it("should navigate to prev node", () => {
        useNodeFocusStore.getState().navigateFocus("prev", nodes);

        expect(useNodeFocusStore.getState().focusedNodeId).toBe("node-4");
      });

      it("should cycle through nodes with next navigation", () => {
        useNodeFocusStore.getState().navigateFocus("next", nodes);
        expect(useNodeFocusStore.getState().focusedNodeId).toBe("node-1");

        useNodeFocusStore.getState().navigateFocus("next", nodes);
        expect(useNodeFocusStore.getState().focusedNodeId).toBe("node-2");

        useNodeFocusStore.getState().navigateFocus("next", nodes);
        expect(useNodeFocusStore.getState().focusedNodeId).toBe("node-3");

        useNodeFocusStore.getState().navigateFocus("next", nodes);
        expect(useNodeFocusStore.getState().focusedNodeId).toBe("node-4");

        useNodeFocusStore.getState().navigateFocus("next", nodes);
        expect(useNodeFocusStore.getState().focusedNodeId).toBe("node-1");
      });

      it("should cycle backwards with prev navigation", () => {
        useNodeFocusStore.getState().navigateFocus("prev", nodes);
        expect(useNodeFocusStore.getState().focusedNodeId).toBe("node-4");

        useNodeFocusStore.getState().navigateFocus("prev", nodes);
        expect(useNodeFocusStore.getState().focusedNodeId).toBe("node-3");
      });

      it("should navigate from current node position", () => {
        useNodeFocusStore.getState().setFocusedNode("node-2");
        useNodeFocusStore.getState().navigateFocus("next", nodes);

        expect(useNodeFocusStore.getState().focusedNodeId).toBe("node-3");
      });

      it("should add navigated nodes to history", () => {
        useNodeFocusStore.getState().navigateFocus("next", nodes);

        expect(useNodeFocusStore.getState().focusHistory).toContain("node-1");
      });
    });

    describe("directional navigation", () => {
      it("should navigate up to node above", () => {
        useNodeFocusStore.getState().setFocusedNode("node-3");
        useNodeFocusStore.getState().navigateFocus("up", nodes);

        expect(useNodeFocusStore.getState().focusedNodeId).toBe("node-1");
      });

      it("should navigate down to node below", () => {
        useNodeFocusStore.getState().setFocusedNode("node-1");
        useNodeFocusStore.getState().navigateFocus("down", nodes);

        expect(useNodeFocusStore.getState().focusedNodeId).toBe("node-3");
      });

      it("should navigate left to node on left", () => {
        useNodeFocusStore.getState().setFocusedNode("node-2");
        useNodeFocusStore.getState().navigateFocus("left", nodes);

        expect(useNodeFocusStore.getState().focusedNodeId).toBe("node-1");
      });

      it("should navigate right to node on right", () => {
        useNodeFocusStore.getState().setFocusedNode("node-1");
        useNodeFocusStore.getState().navigateFocus("right", nodes);

        expect(useNodeFocusStore.getState().focusedNodeId).toBe("node-2");
      });

      it("should not change focus if no node in direction", () => {
        useNodeFocusStore.getState().setFocusedNode("node-1");
        useNodeFocusStore.getState().navigateFocus("up", nodes);

        expect(useNodeFocusStore.getState().focusedNodeId).toBe("node-1");
      });

      it("should choose closest node in direction", () => {
        const nodesWithDiagonal = [
          createMockNode("node-1", 0, 0),
          createMockNode("node-2", 10, 100),
          createMockNode("node-3", 50, 100),
          createMockNode("node-4", 100, 100)
        ];

        useNodeFocusStore.getState().setFocusedNode("node-1");
        useNodeFocusStore.getState().navigateFocus("down", nodesWithDiagonal);

        expect(useNodeFocusStore.getState().focusedNodeId).toBe("node-2");
      });
    });
  });

  describe("clearFocusHistory", () => {
    it("should clear focus history", () => {
      useNodeFocusStore.getState().setFocusedNode("node-1");
      useNodeFocusStore.getState().setFocusedNode("node-2");

      expect(useNodeFocusStore.getState().focusHistory).toHaveLength(2);

      useNodeFocusStore.getState().clearFocusHistory();

      expect(useNodeFocusStore.getState().focusHistory).toEqual([]);
    });

    it("should not clear focusedNodeId", () => {
      useNodeFocusStore.getState().setFocusedNode("node-1");
      useNodeFocusStore.getState().clearFocusHistory();

      expect(useNodeFocusStore.getState().focusedNodeId).toBe("node-1");
    });
  });
});
