import { act } from "@testing-library/react";
import useNodePlacementStore, { NodePlacementSource } from "../NodePlacementStore";

describe("NodePlacementStore", () => {
  beforeEach(() => {
    // Reset store to initial state
    useNodePlacementStore.setState({
      pendingNodeType: null,
      label: null,
      source: null
    });
  });

  describe("initial state", () => {
    it("has null pendingNodeType", () => {
      const { pendingNodeType } = useNodePlacementStore.getState();
      expect(pendingNodeType).toBeNull();
    });

    it("has null label", () => {
      const { label } = useNodePlacementStore.getState();
      expect(label).toBeNull();
    });

    it("has null source", () => {
      const { source } = useNodePlacementStore.getState();
      expect(source).toBeNull();
    });
  });

  describe("activatePlacement", () => {
    it("sets pendingNodeType and label", () => {
      act(() => {
        useNodePlacementStore.getState().activatePlacement("nodetool.image.Generate", "Generate Image");
      });

      const { pendingNodeType, label } = useNodePlacementStore.getState();
      expect(pendingNodeType).toBe("nodetool.image.Generate");
      expect(label).toBe("Generate Image");
    });

    it("sets source to unknown by default", () => {
      act(() => {
        useNodePlacementStore.getState().activatePlacement("nodetool.image.Generate", "Generate Image");
      });

      const { source } = useNodePlacementStore.getState();
      expect(source).toBe("unknown");
    });

    it("sets custom source when provided", () => {
      act(() => {
        useNodePlacementStore.getState().activatePlacement(
          "nodetool.image.Generate",
          "Generate Image",
          "nodeMenu"
        );
      });

      const { source } = useNodePlacementStore.getState();
      expect(source).toBe("nodeMenu");
    });

    it("handles quickAction source", () => {
      act(() => {
        useNodePlacementStore.getState().activatePlacement(
          "nodetool.text.Generate",
          "Generate Text",
          "quickAction"
        );
      });

      const { pendingNodeType, label, source } = useNodePlacementStore.getState();
      expect(pendingNodeType).toBe("nodetool.text.Generate");
      expect(label).toBe("Generate Text");
      expect(source).toBe("quickAction");
    });

    it("overwrites previous placement", () => {
      act(() => {
        useNodePlacementStore.getState().activatePlacement("first.type", "First Label", "nodeMenu");
        useNodePlacementStore.getState().activatePlacement("second.type", "Second Label", "quickAction");
      });

      const { pendingNodeType, label, source } = useNodePlacementStore.getState();
      expect(pendingNodeType).toBe("second.type");
      expect(label).toBe("Second Label");
      expect(source).toBe("quickAction");
    });
  });

  describe("cancelPlacement", () => {
    it("clears all placement state", () => {
      act(() => {
        useNodePlacementStore.getState().activatePlacement(
          "nodetool.image.Generate",
          "Generate Image",
          "nodeMenu"
        );
        useNodePlacementStore.getState().cancelPlacement();
      });

      const { pendingNodeType, label, source } = useNodePlacementStore.getState();
      expect(pendingNodeType).toBeNull();
      expect(label).toBeNull();
      expect(source).toBeNull();
    });

    it("can be called when no placement is pending", () => {
      act(() => {
        useNodePlacementStore.getState().cancelPlacement();
      });

      const { pendingNodeType, label, source } = useNodePlacementStore.getState();
      expect(pendingNodeType).toBeNull();
      expect(label).toBeNull();
      expect(source).toBeNull();
    });
  });

  describe("integration scenarios", () => {
    it("activate then cancel flow", () => {
      // User initiates node placement
      act(() => {
        useNodePlacementStore.getState().activatePlacement(
          "nodetool.audio.Generate",
          "Generate Audio",
          "quickAction"
        );
      });

      expect(useNodePlacementStore.getState().pendingNodeType).toBe("nodetool.audio.Generate");

      // User cancels (e.g., presses Escape)
      act(() => {
        useNodePlacementStore.getState().cancelPlacement();
      });

      expect(useNodePlacementStore.getState().pendingNodeType).toBeNull();
    });

    it("switching between placement sources", () => {
      // User starts from quick action
      act(() => {
        useNodePlacementStore.getState().activatePlacement(
          "type1",
          "Label 1",
          "quickAction"
        );
      });

      expect(useNodePlacementStore.getState().source).toBe("quickAction");

      // User changes mind and opens node menu
      act(() => {
        useNodePlacementStore.getState().activatePlacement(
          "type2",
          "Label 2",
          "nodeMenu"
        );
      });

      expect(useNodePlacementStore.getState().source).toBe("nodeMenu");
      expect(useNodePlacementStore.getState().pendingNodeType).toBe("type2");
    });

    it("all source types work correctly", () => {
      const sources: NodePlacementSource[] = ["quickAction", "nodeMenu", "unknown"];

      sources.forEach((source) => {
        act(() => {
          useNodePlacementStore.getState().activatePlacement("test.type", "Test", source);
        });

        expect(useNodePlacementStore.getState().source).toBe(source);

        act(() => {
          useNodePlacementStore.getState().cancelPlacement();
        });
      });
    });
  });

  describe("edge cases", () => {
    it("handles empty string nodeType", () => {
      act(() => {
        useNodePlacementStore.getState().activatePlacement("", "Empty Type");
      });

      expect(useNodePlacementStore.getState().pendingNodeType).toBe("");
    });

    it("handles empty string label", () => {
      act(() => {
        useNodePlacementStore.getState().activatePlacement("some.type", "");
      });

      expect(useNodePlacementStore.getState().label).toBe("");
    });

    it("handles special characters in nodeType and label", () => {
      act(() => {
        useNodePlacementStore.getState().activatePlacement(
          "my.namespace.node-type_v2",
          "Node Type (v2) - Special"
        );
      });

      const { pendingNodeType, label } = useNodePlacementStore.getState();
      expect(pendingNodeType).toBe("my.namespace.node-type_v2");
      expect(label).toBe("Node Type (v2) - Special");
    });
  });
});
