import { act } from "@testing-library/react";
import useInspectedNodeStore from "../InspectedNodeStore";

describe("InspectedNodeStore", () => {
  beforeEach(() => {
    useInspectedNodeStore.setState(useInspectedNodeStore.getInitialState());
  });

  it("initializes with null inspected node", () => {
    expect(useInspectedNodeStore.getState().inspectedNodeId).toBeNull();
  });

  describe("setInspectedNodeId", () => {
    it("sets inspected node ID", () => {
      act(() => {
        useInspectedNodeStore.getState().setInspectedNodeId("node-1");
      });
      expect(useInspectedNodeStore.getState().inspectedNodeId).toBe("node-1");
    });

    it("clears inspected node ID when null is passed", () => {
      act(() => {
        useInspectedNodeStore.getState().setInspectedNodeId("node-1");
      });
      act(() => {
        useInspectedNodeStore.getState().setInspectedNodeId(null);
      });
      expect(useInspectedNodeStore.getState().inspectedNodeId).toBeNull();
    });

    it("changes inspected node to a different node", () => {
      act(() => {
        useInspectedNodeStore.getState().setInspectedNodeId("node-1");
      });
      act(() => {
        useInspectedNodeStore.getState().setInspectedNodeId("node-2");
      });
      expect(useInspectedNodeStore.getState().inspectedNodeId).toBe("node-2");
    });
  });

  describe("toggleInspectedNode", () => {
    it("sets inspected node when currently null", () => {
      act(() => {
        useInspectedNodeStore.getState().toggleInspectedNode("node-1");
      });
      expect(useInspectedNodeStore.getState().inspectedNodeId).toBe("node-1");
    });

    it("clears inspected node when toggling the same node", () => {
      act(() => {
        useInspectedNodeStore.getState().setInspectedNodeId("node-1");
      });
      act(() => {
        useInspectedNodeStore.getState().toggleInspectedNode("node-1");
      });
      expect(useInspectedNodeStore.getState().inspectedNodeId).toBeNull();
    });

    it("changes to different node when toggling a different node", () => {
      act(() => {
        useInspectedNodeStore.getState().setInspectedNodeId("node-1");
      });
      act(() => {
        useInspectedNodeStore.getState().toggleInspectedNode("node-2");
      });
      expect(useInspectedNodeStore.getState().inspectedNodeId).toBe("node-2");
    });

    it("can toggle multiple times", () => {
      act(() => {
        useInspectedNodeStore.getState().toggleInspectedNode("node-1");
      });
      expect(useInspectedNodeStore.getState().inspectedNodeId).toBe("node-1");

      act(() => {
        useInspectedNodeStore.getState().toggleInspectedNode("node-1");
      });
      expect(useInspectedNodeStore.getState().inspectedNodeId).toBeNull();

      act(() => {
        useInspectedNodeStore.getState().toggleInspectedNode("node-1");
      });
      expect(useInspectedNodeStore.getState().inspectedNodeId).toBe("node-1");
    });
  });
});
