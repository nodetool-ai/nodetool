import { renderHook, act } from "@testing-library/react";
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
      const { result } = renderHook(() => useVersionHistoryStore());

      act(() => {
        result.current.setSelectedVersion("v1");
      });

      expect(result.current.selectedVersionId).toBe("v1");

      act(() => {
        result.current.setSelectedVersion(null);
      });

      expect(result.current.selectedVersionId).toBe(null);
    });

    test("should manage compare mode", () => {
      const { result } = renderHook(() => useVersionHistoryStore());

      act(() => {
        result.current.setCompareMode(true);
      });

      expect(result.current.isCompareMode).toBe(true);
      expect(result.current.compareVersionId).toBe(null);

      act(() => {
        result.current.setCompareVersion("v2");
      });

      expect(result.current.compareVersionId).toBe("v2");

      act(() => {
        result.current.setCompareMode(false);
      });

      expect(result.current.isCompareMode).toBe(false);
      expect(result.current.compareVersionId).toBe(null);
    });

    test("should manage history panel open state", () => {
      const { result } = renderHook(() => useVersionHistoryStore());

      act(() => {
        result.current.setHistoryPanelOpen(true);
      });

      expect(result.current.isHistoryPanelOpen).toBe(true);

      act(() => {
        result.current.setHistoryPanelOpen(false);
      });

      expect(result.current.isHistoryPanelOpen).toBe(false);
    });
  });

  describe("Edit Count Tracking", () => {
    test("should increment edit count", () => {
      const { result } = renderHook(() => useVersionHistoryStore());

      expect(result.current.getEditCount("wf1")).toBe(0);

      act(() => {
        result.current.incrementEditCount("wf1");
      });

      expect(result.current.getEditCount("wf1")).toBe(1);

      act(() => {
        result.current.incrementEditCount("wf1");
      });

      expect(result.current.getEditCount("wf1")).toBe(2);
    });

    test("should reset edit count", () => {
      const { result } = renderHook(() => useVersionHistoryStore());

      act(() => {
        result.current.incrementEditCount("wf1");
        result.current.incrementEditCount("wf1");
      });

      expect(result.current.getEditCount("wf1")).toBe(2);

      act(() => {
        result.current.resetEditCount("wf1");
      });

      expect(result.current.getEditCount("wf1")).toBe(0);
    });

    test("should track edit counts per workflow", () => {
      const { result } = renderHook(() => useVersionHistoryStore());

      act(() => {
        result.current.incrementEditCount("wf1");
        result.current.incrementEditCount("wf1");
        result.current.incrementEditCount("wf2");
      });

      expect(result.current.getEditCount("wf1")).toBe(2);
      expect(result.current.getEditCount("wf2")).toBe(1);
      expect(result.current.getEditCount("wf3")).toBe(0);
    });
  });

  describe("Autosave Time Tracking", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test("should update last autosave time", () => {
      const { result } = renderHook(() => useVersionHistoryStore());

      const beforeTime = Date.now();

      act(() => {
        result.current.updateLastAutosaveTime("wf1");
      });

      const afterTime = Date.now();
      const savedTime = result.current.getLastAutosaveTime("wf1");

      expect(savedTime).toBeGreaterThanOrEqual(beforeTime);
      expect(savedTime).toBeLessThanOrEqual(afterTime);
    });

    test("should track autosave time per workflow", () => {
      const { result } = renderHook(() => useVersionHistoryStore());

      act(() => {
        result.current.updateLastAutosaveTime("wf1");
      });

      const wf1Time = result.current.getLastAutosaveTime("wf1");

      act(() => {
        jest.advanceTimersByTime(1);
        result.current.updateLastAutosaveTime("wf2");
      });

      expect(result.current.getLastAutosaveTime("wf1")).toBe(wf1Time);
      expect(result.current.getLastAutosaveTime("wf2")).toBeGreaterThan(wf1Time);
    });
  });

  describe("clearState", () => {
    test("should clear all state", () => {
      const { result } = renderHook(() => useVersionHistoryStore());

      act(() => {
        result.current.setSelectedVersion("v1");
        result.current.setCompareVersion("v2");
        result.current.setCompareMode(true);
        result.current.setHistoryPanelOpen(true);
        result.current.incrementEditCount("wf1");
        result.current.updateLastAutosaveTime("wf1");
      });

      expect(result.current.selectedVersionId).toBe("v1");
      expect(result.current.compareVersionId).toBe("v2");
      expect(result.current.isCompareMode).toBe(true);
      expect(result.current.isHistoryPanelOpen).toBe(true);
      expect(result.current.getEditCount("wf1")).toBe(1);
      expect(result.current.getLastAutosaveTime("wf1")).toBeGreaterThan(0);

      act(() => {
        result.current.clearState();
      });

      expect(result.current.selectedVersionId).toBe(null);
      expect(result.current.compareVersionId).toBe(null);
      expect(result.current.isCompareMode).toBe(false);
      expect(result.current.isHistoryPanelOpen).toBe(false);
    });
  });
});
