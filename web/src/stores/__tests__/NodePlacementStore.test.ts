import { act } from "@testing-library/react";
import useNodePlacementStore, { NodePlacementSource } from "../NodePlacementStore";

describe("NodePlacementStore", () => {
  beforeEach(() => {
    useNodePlacementStore.setState(useNodePlacementStore.getInitialState());
  });

  afterEach(() => {
    useNodePlacementStore.setState(useNodePlacementStore.getInitialState());
  });

  it("initializes with null values", () => {
    const state = useNodePlacementStore.getState();
    expect(state.pendingNodeType).toBeNull();
    expect(state.label).toBeNull();
    expect(state.source).toBeNull();
  });

  describe("activatePlacement", () => {
    it("activates placement with quickAction source", () => {
      act(() => {
        useNodePlacementStore.getState().activatePlacement("textNode", "Text Node", "quickAction");
      });

      const state = useNodePlacementStore.getState();
      expect(state.pendingNodeType).toBe("textNode");
      expect(state.label).toBe("Text Node");
      expect(state.source).toBe("quickAction");
    });

    it("activates placement with nodeMenu source", () => {
      act(() => {
        useNodePlacementStore.getState().activatePlacement("imageNode", "Image Node", "nodeMenu");
      });

      const state = useNodePlacementStore.getState();
      expect(state.pendingNodeType).toBe("imageNode");
      expect(state.label).toBe("Image Node");
      expect(state.source).toBe("nodeMenu");
    });

    it("activates placement with unknown source when source not provided", () => {
      act(() => {
        useNodePlacementStore.getState().activatePlacement("audioNode", "Audio Node");
      });

      const state = useNodePlacementStore.getState();
      expect(state.pendingNodeType).toBe("audioNode");
      expect(state.label).toBe("Audio Node");
      expect(state.source).toBe("unknown");
    });

    it("overwrites existing placement", () => {
      act(() => {
        useNodePlacementStore.getState().activatePlacement("node1", "Node 1", "quickAction");
        useNodePlacementStore.getState().activatePlacement("node2", "Node 2", "nodeMenu");
      });

      const state = useNodePlacementStore.getState();
      expect(state.pendingNodeType).toBe("node2");
      expect(state.label).toBe("Node 2");
      expect(state.source).toBe("nodeMenu");
    });
  });

  describe("cancelPlacement", () => {
    it("clears all placement state", () => {
      act(() => {
        useNodePlacementStore.getState().activatePlacement("textNode", "Text Node", "quickAction");
        useNodePlacementStore.getState().cancelPlacement();
      });

      const state = useNodePlacementStore.getState();
      expect(state.pendingNodeType).toBeNull();
      expect(state.label).toBeNull();
      expect(state.source).toBeNull();
    });

    it("handles cancel when no placement is active", () => {
      act(() => {
        useNodePlacementStore.getState().cancelPlacement();
      });

      const state = useNodePlacementStore.getState();
      expect(state.pendingNodeType).toBeNull();
      expect(state.label).toBeNull();
      expect(state.source).toBeNull();
    });
  });

  describe("complete placement flow", () => {
    it("handles full placement lifecycle", () => {
      // Start placement
      act(() => {
        useNodePlacementStore.getState().activatePlacement("customNode", "Custom Node", "nodeMenu");
      });

      expect(useNodePlacementStore.getState().pendingNodeType).toBe("customNode");
      expect(useNodePlacementStore.getState().label).toBe("Custom Node");

      // Cancel placement
      act(() => {
        useNodePlacementStore.getState().cancelPlacement();
      });

      expect(useNodePlacementStore.getState().pendingNodeType).toBeNull();
      expect(useNodePlacementStore.getState().label).toBeNull();
    });

    it("handles multiple placement cycles", () => {
      // First cycle
      act(() => {
        useNodePlacementStore.getState().activatePlacement("node1", "Node 1", "quickAction");
      });

      act(() => {
        useNodePlacementStore.getState().cancelPlacement();
      });

      // Second cycle
      act(() => {
        useNodePlacementStore.getState().activatePlacement("node2", "Node 2", "nodeMenu");
      });

      const state = useNodePlacementStore.getState();
      expect(state.pendingNodeType).toBe("node2");
      expect(state.label).toBe("Node 2");
      expect(state.source).toBe("nodeMenu");
    });
  });
});
