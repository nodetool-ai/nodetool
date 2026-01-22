import { renderHook, act } from "@testing-library/react";
import { useVersionHistoryStore } from "../VersionHistoryStore";

describe("VersionHistoryStore", () => {
  beforeEach(() => {
    useVersionHistoryStore.setState(useVersionHistoryStore.getInitialState());
  });

  afterEach(() => {
    act(() => {
      useVersionHistoryStore.getState().clearState();
    });
  });

  describe("Initial State", () => {
    it("should initialize with null selected version", () => {
      const { result } = renderHook(() => useVersionHistoryStore());
      expect(result.current.selectedVersionId).toBeNull();
    });

    it("should initialize with compare mode disabled", () => {
      const { result } = renderHook(() => useVersionHistoryStore());
      expect(result.current.isCompareMode).toBe(false);
    });

    it("should initialize with history panel closed", () => {
      const { result } = renderHook(() => useVersionHistoryStore());
      expect(result.current.isHistoryPanelOpen).toBe(false);
    });

    it("should initialize with empty edit count record", () => {
      const { result } = renderHook(() => useVersionHistoryStore());
      expect(result.current.editCountSinceLastSave).toEqual({});
    });

    it("should initialize with empty autosave time record", () => {
      const { result } = renderHook(() => useVersionHistoryStore());
      expect(result.current.lastAutosaveTime).toEqual({});
    });
  });

  describe("Version Selection", () => {
    it("should set selected version", () => {
      const { result } = renderHook(() => useVersionHistoryStore());

      act(() => {
        result.current.setSelectedVersion("version-1");
      });

      expect(result.current.selectedVersionId).toBe("version-1");
    });

    it("should set selected version to null", () => {
      const { result } = renderHook(() => useVersionHistoryStore());

      act(() => {
        result.current.setSelectedVersion("version-1");
        result.current.setSelectedVersion(null);
      });

      expect(result.current.selectedVersionId).toBeNull();
    });

    it("should set compare version", () => {
      const { result } = renderHook(() => useVersionHistoryStore());

      act(() => {
        result.current.setCompareVersion("version-2");
      });

      expect(result.current.compareVersionId).toBe("version-2");
    });

    it("should clear compare version when compare mode is disabled", () => {
      const { result } = renderHook(() => useVersionHistoryStore());

      act(() => {
        result.current.setCompareVersion("version-2");
        result.current.setCompareMode(true);
        result.current.setCompareMode(false);
      });

      expect(result.current.compareVersionId).toBeNull();
    });
  });

  describe("Panel State", () => {
    it("should open history panel", () => {
      const { result } = renderHook(() => useVersionHistoryStore());

      act(() => {
        result.current.setHistoryPanelOpen(true);
      });

      expect(result.current.isHistoryPanelOpen).toBe(true);
    });

    it("should close history panel", () => {
      const { result } = renderHook(() => useVersionHistoryStore());

      act(() => {
        result.current.setHistoryPanelOpen(true);
        result.current.setHistoryPanelOpen(false);
      });

      expect(result.current.isHistoryPanelOpen).toBe(false);
    });

    it("should enable compare mode", () => {
      const { result } = renderHook(() => useVersionHistoryStore());

      act(() => {
        result.current.setCompareMode(true);
      });

      expect(result.current.isCompareMode).toBe(true);
    });

    it("should disable compare mode and clear compare version", () => {
      const { result } = renderHook(() => useVersionHistoryStore());

      act(() => {
        result.current.setCompareVersion("version-2");
        result.current.setCompareMode(true);
        result.current.setCompareMode(false);
      });

      expect(result.current.isCompareMode).toBe(false);
      expect(result.current.compareVersionId).toBeNull();
    });
  });

  describe("Edit Count Tracking", () => {
    it("should increment edit count for workflow", () => {
      const { result } = renderHook(() => useVersionHistoryStore());

      act(() => {
        result.current.incrementEditCount("workflow-1");
      });

      expect(result.current.getEditCount("workflow-1")).toBe(1);
    });

    it("should increment edit count multiple times", () => {
      const { result } = renderHook(() => useVersionHistoryStore());

      act(() => {
        result.current.incrementEditCount("workflow-1");
        result.current.incrementEditCount("workflow-1");
        result.current.incrementEditCount("workflow-1");
      });

      expect(result.current.getEditCount("workflow-1")).toBe(3);
    });

    it("should track edit counts for multiple workflows", () => {
      const { result } = renderHook(() => useVersionHistoryStore());

      act(() => {
        result.current.incrementEditCount("workflow-1");
        result.current.incrementEditCount("workflow-1");
        result.current.incrementEditCount("workflow-2");
      });

      expect(result.current.getEditCount("workflow-1")).toBe(2);
      expect(result.current.getEditCount("workflow-2")).toBe(1);
    });

    it("should reset edit count for workflow", () => {
      const { result } = renderHook(() => useVersionHistoryStore());

      act(() => {
        result.current.incrementEditCount("workflow-1");
        result.current.incrementEditCount("workflow-1");
        result.current.resetEditCount("workflow-1");
      });

      expect(result.current.getEditCount("workflow-1")).toBe(0);
    });

    it("should return 0 for unknown workflow edit count", () => {
      const { result } = renderHook(() => useVersionHistoryStore());
      expect(result.current.getEditCount("unknown-workflow")).toBe(0);
    });
  });

  describe("Autosave Time Tracking", () => {
    it("should update last autosave time for workflow", () => {
      const { result } = renderHook(() => useVersionHistoryStore());

      const beforeTime = Date.now();
      act(() => {
        result.current.updateLastAutosaveTime("workflow-1");
      });
      const afterTime = Date.now();

      const storedTime = result.current.getLastAutosaveTime("workflow-1");
      expect(storedTime).toBeGreaterThanOrEqual(beforeTime);
      expect(storedTime).toBeLessThanOrEqual(afterTime);
    });

    it("should track autosave times for multiple workflows", () => {
      const { result } = renderHook(() => useVersionHistoryStore());

      act(() => {
        result.current.updateLastAutosaveTime("workflow-1");
        result.current.updateLastAutosaveTime("workflow-2");
      });

      expect(result.current.getLastAutosaveTime("workflow-1")).toBeGreaterThan(0);
      expect(result.current.getLastAutosaveTime("workflow-2")).toBeGreaterThan(0);
    });

    it("should return 0 for unknown workflow autosave time", () => {
      const { result } = renderHook(() => useVersionHistoryStore());
      expect(result.current.getLastAutosaveTime("unknown-workflow")).toBe(0);
    });
  });

  describe("Clear State", () => {
    it("should clear all UI state", () => {
      const { result } = renderHook(() => useVersionHistoryStore());

      act(() => {
        result.current.setSelectedVersion("version-1");
        result.current.setCompareVersion("version-2");
        result.current.setCompareMode(true);
        result.current.setHistoryPanelOpen(true);
        result.current.incrementEditCount("workflow-1");
        result.current.updateLastAutosaveTime("workflow-1");
        result.current.clearState();
      });

      expect(result.current.selectedVersionId).toBeNull();
      expect(result.current.compareVersionId).toBeNull();
      expect(result.current.isCompareMode).toBe(false);
      expect(result.current.isHistoryPanelOpen).toBe(false);
    });

    it("should not clear edit count and autosave time on clearState", () => {
      const { result } = renderHook(() => useVersionHistoryStore());

      act(() => {
        result.current.incrementEditCount("workflow-1");
        result.current.updateLastAutosaveTime("workflow-1");
        result.current.clearState();
      });

      expect(result.current.getEditCount("workflow-1")).toBe(1);
      expect(result.current.getLastAutosaveTime("workflow-1")).toBeGreaterThan(0);
    });
  });

  describe("Complete User Workflow", () => {
    it("should track complete version history workflow", () => {
      const { result } = renderHook(() => useVersionHistoryStore());

      act(() => {
        result.current.setHistoryPanelOpen(true);
        result.current.setSelectedVersion("version-1");
        result.current.setCompareMode(true);
        result.current.setCompareVersion("version-2");
      });

      expect(result.current.isHistoryPanelOpen).toBe(true);
      expect(result.current.selectedVersionId).toBe("version-1");
      expect(result.current.isCompareMode).toBe(true);
      expect(result.current.compareVersionId).toBe("version-2");

      act(() => {
        result.current.clearState();
      });

      expect(result.current.selectedVersionId).toBeNull();
      expect(result.current.compareVersionId).toBeNull();
      expect(result.current.isCompareMode).toBe(false);
    });
  });
});
