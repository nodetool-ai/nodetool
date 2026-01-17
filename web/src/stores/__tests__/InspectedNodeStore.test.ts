import { useInspectedNodeStore } from "../InspectedNodeStore";

describe("InspectedNodeStore", () => {
  beforeEach(() => {
    useInspectedNodeStore.setState(useInspectedNodeStore.getInitialState());
  });

  describe("initial state", () => {
    it("should initialize with inspectedNodeId set to null", () => {
      const state = useInspectedNodeStore.getInitialState();
      expect(state.inspectedNodeId).toBeNull();
    });
  });

  describe("setInspectedNodeId", () => {
    it("should set inspectedNodeId to a node ID", () => {
      useInspectedNodeStore.getState().setInspectedNodeId("node-1");
      expect(useInspectedNodeStore.getState().inspectedNodeId).toBe("node-1");
    });

    it("should set inspectedNodeId to null", () => {
      useInspectedNodeStore.setState({ inspectedNodeId: "node-1" });
      useInspectedNodeStore.getState().setInspectedNodeId(null);
      expect(useInspectedNodeStore.getState().inspectedNodeId).toBeNull();
    });

    it("should update from null to node ID", () => {
      expect(useInspectedNodeStore.getState().inspectedNodeId).toBeNull();
      useInspectedNodeStore.getState().setInspectedNodeId("node-2");
      expect(useInspectedNodeStore.getState().inspectedNodeId).toBe("node-2");
    });
  });

  describe("toggleInspectedNode", () => {
    it("should set inspectedNodeId when currently null", () => {
      useInspectedNodeStore.getState().toggleInspectedNode("node-1");
      expect(useInspectedNodeStore.getState().inspectedNodeId).toBe("node-1");
    });

    it("should set inspectedNodeId to null when toggling the same node", () => {
      useInspectedNodeStore.setState({ inspectedNodeId: "node-1" });
      useInspectedNodeStore.getState().toggleInspectedNode("node-1");
      expect(useInspectedNodeStore.getState().inspectedNodeId).toBeNull();
    });

    it("should switch to a different node when toggling a different node", () => {
      useInspectedNodeStore.setState({ inspectedNodeId: "node-1" });
      useInspectedNodeStore.getState().toggleInspectedNode("node-2");
      expect(useInspectedNodeStore.getState().inspectedNodeId).toBe("node-2");
    });

    it("should handle multiple toggles", () => {
      useInspectedNodeStore.getState().toggleInspectedNode("node-1");
      expect(useInspectedNodeStore.getState().inspectedNodeId).toBe("node-1");

      useInspectedNodeStore.getState().toggleInspectedNode("node-1");
      expect(useInspectedNodeStore.getState().inspectedNodeId).toBeNull();

      useInspectedNodeStore.getState().toggleInspectedNode("node-2");
      expect(useInspectedNodeStore.getState().inspectedNodeId).toBe("node-2");

      useInspectedNodeStore.getState().toggleInspectedNode("node-3");
      expect(useInspectedNodeStore.getState().inspectedNodeId).toBe("node-3");
    });
  });

  describe("full workflow", () => {
    it("should handle inspect and uninspect flow", () => {
      expect(useInspectedNodeStore.getState().inspectedNodeId).toBeNull();

      useInspectedNodeStore.getState().setInspectedNodeId("node-1");
      expect(useInspectedNodeStore.getState().inspectedNodeId).toBe("node-1");

      useInspectedNodeStore.getState().setInspectedNodeId(null);
      expect(useInspectedNodeStore.getState().inspectedNodeId).toBeNull();

      useInspectedNodeStore.getState().toggleInspectedNode("node-2");
      expect(useInspectedNodeStore.getState().inspectedNodeId).toBe("node-2");

      useInspectedNodeStore.getState().toggleInspectedNode("node-2");
      expect(useInspectedNodeStore.getState().inspectedNodeId).toBeNull();
    });
  });
});
