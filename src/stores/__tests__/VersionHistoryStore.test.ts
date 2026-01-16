import { act } from "react";
import { useVersionHistoryStore } from "../VersionHistoryStore";

describe("VersionHistoryStore", () => {
  beforeEach(() => {
    useVersionHistoryStore.setState(useVersionHistoryStore.getInitialState());
  });

  afterEach(() => {
    useVersionHistoryStore.setState(useVersionHistoryStore.getInitialState());
  });

  it("initializes with default state", () => {
    const state = useVersionHistoryStore.getState();
    expect(state.selectedVersionId).toBeNull();
    expect(state.compareVersionId).toBeNull();
    expect(state.isCompareMode).toBe(false);
    expect(state.isHistoryPanelOpen).toBe(false);
    expect(state.editCountSinceLastSave).toEqual({});
    expect(state.lastAutosaveTime).toEqual({});
  });

  describe("setSelectedVersion", () => {
    it("sets selected version ID", () => {
      act(() => {
        useVersionHistoryStore.getState().setSelectedVersion("v123");
      });
      expect(useVersionHistoryStore.getState().selectedVersionId).toBe("v123");
    });

    it("can set null", () => {
      act(() => {
        useVersionHistoryStore.getState().setSelectedVersion("v123");
        useVersionHistoryStore.getState().setSelectedVersion(null);
      });
      expect(useVersionHistoryStore.getState().selectedVersionId).toBeNull();
    });
  });

  describe("setCompareVersion", () => {
    it("sets compare version ID", () => {
      act(() => {
        useVersionHistoryStore.getState().setCompareVersion("v456");
      });
      expect(useVersionHistoryStore.getState().compareVersionId).toBe("v456");
    });
  });

  describe("setHistoryPanelOpen", () => {
    it("opens and closes panel", () => {
      expect(useVersionHistoryStore.getState().isHistoryPanelOpen).toBe(false);
      act(() => {
        useVersionHistoryStore.getState().setHistoryPanelOpen(true);
      });
      expect(useVersionHistoryStore.getState().isHistoryPanelOpen).toBe(true);
      act(() => {
        useVersionHistoryStore.getState().setHistoryPanelOpen(false);
      });
      expect(useVersionHistoryStore.getState().isHistoryPanelOpen).toBe(false);
    });
  });

  describe("setCompareMode", () => {
    it("enables compare mode", () => {
      act(() => {
        useVersionHistoryStore.getState().setCompareMode(true);
      });
      expect(useVersionHistoryStore.getState().isCompareMode).toBe(true);
    });

    it("disables compare mode and clears compare version", () => {
      act(() => {
        useVersionHistoryStore.getState().setCompareVersion("v456");
        useVersionHistoryStore.getState().setCompareMode(true);
        useVersionHistoryStore.getState().setCompareMode(false);
      });
      expect(useVersionHistoryStore.getState().isCompareMode).toBe(false);
      expect(useVersionHistoryStore.getState().compareVersionId).toBeNull();
    });
  });

  describe("edit count operations", () => {
    it("increments edit count for workflow", () => {
      act(() => {
        useVersionHistoryStore.getState().incrementEditCount("wf-1");
        useVersionHistoryStore.getState().incrementEditCount("wf-1");
        useVersionHistoryStore.getState().incrementEditCount("wf-2");
      });
      expect(useVersionHistoryStore.getState().getEditCount("wf-1")).toBe(2);
      expect(useVersionHistoryStore.getState().getEditCount("wf-2")).toBe(1);
    });

    it("returns 0 for unknown workflow", () => {
      expect(useVersionHistoryStore.getState().getEditCount("unknown")).toBe(0);
    });

    it("resets edit count for workflow", () => {
      act(() => {
        useVersionHistoryStore.getState().incrementEditCount("wf-1");
        useVersionHistoryStore.getState().incrementEditCount("wf-1");
        useVersionHistoryStore.getState().resetEditCount("wf-1");
      });
      expect(useVersionHistoryStore.getState().getEditCount("wf-1")).toBe(0);
    });
  });

  describe("autosave time operations", () => {
    it("updates last autosave time for workflow", () => {
      const before = Date.now();
      act(() => {
        useVersionHistoryStore.getState().updateLastAutosaveTime("wf-1");
      });
      const after = Date.now();
      const savedTime = useVersionHistoryStore.getState().getLastAutosaveTime("wf-1");
      expect(savedTime).toBeGreaterThanOrEqual(before);
      expect(savedTime).toBeLessThanOrEqual(after);
    });

    it("returns 0 for unknown workflow", () => {
      expect(useVersionHistoryStore.getState().getLastAutosaveTime("unknown")).toBe(0);
    });

    it("tracks different workflows independently", () => {
      act(() => {
        useVersionHistoryStore.getState().updateLastAutosaveTime("wf-1");
      });
      const time1 = useVersionHistoryStore.getState().getLastAutosaveTime("wf-1");
      expect(time1).toBeGreaterThan(0);
      expect(useVersionHistoryStore.getState().getLastAutosaveTime("wf-2")).toBe(0);
    });
  });

  describe("clearState", () => {
    it("clears all UI state but not persisted data", () => {
      act(() => {
        useVersionHistoryStore.getState().setSelectedVersion("v1");
        useVersionHistoryStore.getState().setCompareVersion("v2");
        useVersionHistoryStore.getState().setCompareMode(true);
        useVersionHistoryStore.getState().setHistoryPanelOpen(true);
        useVersionHistoryStore.getState().incrementEditCount("wf-1");
        useVersionHistoryStore.getState().updateLastAutosaveTime("wf-1");
        useVersionHistoryStore.getState().clearState();
      });
      const state = useVersionHistoryStore.getState();
      expect(state.selectedVersionId).toBeNull();
      expect(state.compareVersionId).toBeNull();
      expect(state.isCompareMode).toBe(false);
      expect(state.isHistoryPanelOpen).toBe(false);
      // Note: editCount and autosaveTime may or may not be cleared depending on implementation
    });
  });
});
