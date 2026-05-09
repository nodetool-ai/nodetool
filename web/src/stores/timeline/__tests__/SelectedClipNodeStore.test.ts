import { act } from "@testing-library/react";
import { useSelectedClipNodeStore } from "../SelectedClipNodeStore";

describe("SelectedClipNodeStore", () => {
  beforeEach(() => {
    act(() => {
      useSelectedClipNodeStore.getState().setSelectedClipNodeId(null);
    });
  });

  describe("initial state", () => {
    it("has null selectedClipNodeId", () => {
      expect(useSelectedClipNodeStore.getState().selectedClipNodeId).toBeNull();
    });
  });

  describe("setSelectedClipNodeId", () => {
    it("sets a node id", () => {
      act(() => {
        useSelectedClipNodeStore.getState().setSelectedClipNodeId("node-123");
      });
      expect(useSelectedClipNodeStore.getState().selectedClipNodeId).toBe("node-123");
    });

    it("clears selection with null", () => {
      act(() => {
        useSelectedClipNodeStore.getState().setSelectedClipNodeId("node-123");
        useSelectedClipNodeStore.getState().setSelectedClipNodeId(null);
      });
      expect(useSelectedClipNodeStore.getState().selectedClipNodeId).toBeNull();
    });

    it("replaces previous selection", () => {
      act(() => {
        useSelectedClipNodeStore.getState().setSelectedClipNodeId("node-1");
        useSelectedClipNodeStore.getState().setSelectedClipNodeId("node-2");
      });
      expect(useSelectedClipNodeStore.getState().selectedClipNodeId).toBe("node-2");
    });
  });

  describe("resetForClip", () => {
    it("sets selectedClipNodeId to provided default", () => {
      act(() => {
        useSelectedClipNodeStore.getState().setSelectedClipNodeId("old-node");
        useSelectedClipNodeStore.getState().resetForClip("output-node");
      });
      expect(useSelectedClipNodeStore.getState().selectedClipNodeId).toBe("output-node");
    });

    it("resets to null when no default provided", () => {
      act(() => {
        useSelectedClipNodeStore.getState().setSelectedClipNodeId("node-1");
        useSelectedClipNodeStore.getState().resetForClip(null);
      });
      expect(useSelectedClipNodeStore.getState().selectedClipNodeId).toBeNull();
    });
  });
});
