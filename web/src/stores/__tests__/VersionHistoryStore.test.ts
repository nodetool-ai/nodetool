import { act } from "@testing-library/react";
import { useVersionHistoryStore } from "../VersionHistoryStore";

describe("VersionHistoryStore", () => {
  beforeEach(() => {
    useVersionHistoryStore.setState({
      selectedVersionId: null,
      compareVersionId: null,
      isCompareMode: false,
      isHistoryPanelOpen: false,
      lastAutosaveTime: {},
      editCountSinceLastSave: {}
    });
  });

  describe("UI State", () => {
    test("should manage selected version", () => {
      act(() => {
        useVersionHistoryStore.getState().setSelectedVersion("v1");
      });

      expect(useVersionHistoryStore.getState().selectedVersionId).toBe("v1");

      act(() => {
        useVersionHistoryStore.getState().setSelectedVersion(null);
      });

      expect(useVersionHistoryStore.getState().selectedVersionId).toBe(null);
    });

    test("should manage compare mode", () => {
      act(() => {
        useVersionHistoryStore.getState().setCompareMode(true);
      });

      expect(useVersionHistoryStore.getState().isCompareMode).toBe(true);
      expect(useVersionHistoryStore.getState().compareVersionId).toBe(null);

      act(() => {
        useVersionHistoryStore.getState().setCompareVersion("v2");
      });

      expect(useVersionHistoryStore.getState().compareVersionId).toBe("v2");

      act(() => {
        useVersionHistoryStore.getState().setCompareMode(false);
      });

      expect(useVersionHistoryStore.getState().isCompareMode).toBe(false);
      expect(useVersionHistoryStore.getState().compareVersionId).toBe(null);
    });

    test("should manage history panel open state", () => {
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

  describe("Edit Count Tracking", () => {
    test("should increment edit count", () => {
      expect(useVersionHistoryStore.getState().getEditCount("wf1")).toBe(0);

      act(() => {
        useVersionHistoryStore.getState().incrementEditCount("wf1");
      });

      expect(useVersionHistoryStore.getState().getEditCount("wf1")).toBe(1);

      act(() => {
        useVersionHistoryStore.getState().incrementEditCount("wf1");
      });

      expect(useVersionHistoryStore.getState().getEditCount("wf1")).toBe(2);
    });

    test("should reset edit count", () => {
      act(() => {
        useVersionHistoryStore.getState().incrementEditCount("wf1");
        useVersionHistoryStore.getState().incrementEditCount("wf1");
        useVersionHistoryStore.getState().resetEditCount("wf1");
      });

      expect(useVersionHistoryStore.getState().getEditCount("wf1")).toBe(0);
    });

    test("should track edit counts per workflow", () => {
      act(() => {
        useVersionHistoryStore.getState().incrementEditCount("wf1");
        useVersionHistoryStore.getState().incrementEditCount("wf1");
        useVersionHistoryStore.getState().incrementEditCount("wf2");
      });

      expect(useVersionHistoryStore.getState().getEditCount("wf1")).toBe(2);
      expect(useVersionHistoryStore.getState().getEditCount("wf2")).toBe(1);
      expect(useVersionHistoryStore.getState().getEditCount("wf3")).toBe(0);
    });

    test("should get edit count returns 0 for unknown workflow", () => {
      expect(useVersionHistoryStore.getState().getEditCount("unknown")).toBe(0);
    });
  });

  describe("Autosave Time Tracking", () => {
    test("should update and get last autosave time", () => {
      const beforeTime = Date.now();

      act(() => {
        useVersionHistoryStore.getState().updateLastAutosaveTime("wf1");
      });

      const afterTime = Date.now();
      const savedTime = useVersionHistoryStore.getState().getLastAutosaveTime("wf1");

      expect(savedTime).toBeGreaterThanOrEqual(beforeTime);
      expect(savedTime).toBeLessThanOrEqual(afterTime);
    });

    test("should store autosave time per workflow independently", () => {
      act(() => {
        useVersionHistoryStore.getState().updateLastAutosaveTime("wf1");
      });

      const time1 = useVersionHistoryStore.getState().getLastAutosaveTime("wf1");

      act(() => {
        useVersionHistoryStore.getState().updateLastAutosaveTime("wf2");
      });

      const time2 = useVersionHistoryStore.getState().getLastAutosaveTime("wf2");

      expect(useVersionHistoryStore.getState().getLastAutosaveTime("wf1")).toBe(time1);
      expect(time2).toBeGreaterThanOrEqual(time1);
    });

    test("should get last autosave time returns 0 for unknown workflow", () => {
      expect(useVersionHistoryStore.getState().getLastAutosaveTime("unknown")).toBe(0);
    });
  });

  describe("Clear State", () => {
    test("should clear UI state but preserve autosave time", () => {
      act(() => {
        useVersionHistoryStore.getState().setSelectedVersion("v1");
        useVersionHistoryStore.getState().setCompareVersion("v2");
        useVersionHistoryStore.getState().setCompareMode(true);
        useVersionHistoryStore.getState().setHistoryPanelOpen(true);
        useVersionHistoryStore.getState().updateLastAutosaveTime("wf1");
        useVersionHistoryStore.getState().clearState();
      });

      expect(useVersionHistoryStore.getState().selectedVersionId).toBeNull();
      expect(useVersionHistoryStore.getState().compareVersionId).toBeNull();
      expect(useVersionHistoryStore.getState().isCompareMode).toBe(false);
      expect(useVersionHistoryStore.getState().isHistoryPanelOpen).toBe(false);
      // clearState only clears UI state, not edit counts
      expect(useVersionHistoryStore.getState().getLastAutosaveTime("wf1")).toBeGreaterThan(0);
    });

    test("should preserve autosave time across clear state", () => {
      act(() => {
        useVersionHistoryStore.getState().updateLastAutosaveTime("wf1");
        useVersionHistoryStore.getState().clearState();
      });

      expect(useVersionHistoryStore.getState().getLastAutosaveTime("wf1")).toBeGreaterThan(0);
    });
  });
});
