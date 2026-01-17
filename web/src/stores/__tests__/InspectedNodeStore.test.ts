import useInspectedNodeStore from "../InspectedNodeStore";

describe("InspectedNodeStore", () => {
  const initialState = useInspectedNodeStore.getState();

  beforeEach(() => {
    useInspectedNodeStore.setState(initialState, true);
  });

  describe("initial state", () => {
    it("starts with inspectedNodeId as null", () => {
      expect(useInspectedNodeStore.getState().inspectedNodeId).toBeNull();
    });
  });

  describe("setInspectedNodeId", () => {
    it("sets inspectedNodeId to a specific node ID", () => {
      useInspectedNodeStore.getState().setInspectedNodeId("node-123");
      expect(useInspectedNodeStore.getState().inspectedNodeId).toBe("node-123");
    });

    it("sets inspectedNodeId to null", () => {
      useInspectedNodeStore.setState({ inspectedNodeId: "node-456" });
      useInspectedNodeStore.getState().setInspectedNodeId(null);
      expect(useInspectedNodeStore.getState().inspectedNodeId).toBeNull();
    });

    it("can change from one node to another", () => {
      useInspectedNodeStore.getState().setInspectedNodeId("node-1");
      expect(useInspectedNodeStore.getState().inspectedNodeId).toBe("node-1");

      useInspectedNodeStore.getState().setInspectedNodeId("node-2");
      expect(useInspectedNodeStore.getState().inspectedNodeId).toBe("node-2");
    });
  });

  describe("toggleInspectedNode", () => {
    it("sets inspectedNodeId when current is null", () => {
      useInspectedNodeStore.getState().toggleInspectedNode("node-789");
      expect(useInspectedNodeStore.getState().inspectedNodeId).toBe("node-789");
    });

    it("sets inspectedNodeId to null when toggling the same node", () => {
      useInspectedNodeStore.setState({ inspectedNodeId: "node-999" });
      useInspectedNodeStore.getState().toggleInspectedNode("node-999");
      expect(useInspectedNodeStore.getState().inspectedNodeId).toBeNull();
    });

    it("switches to different node when toggling a different node", () => {
      useInspectedNodeStore.setState({ inspectedNodeId: "node-a" });
      useInspectedNodeStore.getState().toggleInspectedNode("node-b");
      expect(useInspectedNodeStore.getState().inspectedNodeId).toBe("node-b");
    });

    it("can toggle on and off", () => {
      // Toggle on
      useInspectedNodeStore.getState().toggleInspectedNode("toggle-node");
      expect(useInspectedNodeStore.getState().inspectedNodeId).toBe("toggle-node");

      // Toggle off
      useInspectedNodeStore.getState().toggleInspectedNode("toggle-node");
      expect(useInspectedNodeStore.getState().inspectedNodeId).toBeNull();
    });

    it("handles multiple different nodes", () => {
      useInspectedNodeStore.getState().toggleInspectedNode("node-1");
      expect(useInspectedNodeStore.getState().inspectedNodeId).toBe("node-1");

      useInspectedNodeStore.getState().toggleInspectedNode("node-2");
      expect(useInspectedNodeStore.getState().inspectedNodeId).toBe("node-2");

      useInspectedNodeStore.getState().toggleInspectedNode("node-3");
      expect(useInspectedNodeStore.getState().inspectedNodeId).toBe("node-3");
    });
  });

  describe("combined operations", () => {
    it("setInspectedNodeId and toggle work together", () => {
      useInspectedNodeStore.getState().setInspectedNodeId("node-a");
      expect(useInspectedNodeStore.getState().inspectedNodeId).toBe("node-a");

      useInspectedNodeStore.getState().toggleInspectedNode("node-a");
      expect(useInspectedNodeStore.getState().inspectedNodeId).toBeNull();

      useInspectedNodeStore.getState().setInspectedNodeId("node-b");
      expect(useInspectedNodeStore.getState().inspectedNodeId).toBe("node-b");
    });
  });
});
