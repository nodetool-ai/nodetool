import { renderHook, act } from "@testing-library/react";
import { useVersionHistoryStore, WorkflowBranch } from "../VersionHistoryStore";

describe("VersionHistoryStore", () => {
  beforeEach(() => {
    useVersionHistoryStore.setState({
      selectedVersionId: null,
      compareVersionId: null,
      isCompareMode: false,
      isHistoryPanelOpen: false,
      branches: [],
      currentBranchId: null,
      isCreatingBranch: false,
      lastAutosaveTime: {},
      editCountSinceLastSave: {},
      viewMode: "list"
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

    test("should manage view mode", () => {
      const { result } = renderHook(() => useVersionHistoryStore());

      expect(result.current.viewMode).toBe("list");

      act(() => {
        result.current.setViewMode("timeline");
      });

      expect(result.current.viewMode).toBe("timeline");

      act(() => {
        result.current.setViewMode("list");
      });

      expect(result.current.viewMode).toBe("list");
    });
  });

  describe("Branch Management", () => {
    const mockBranch: WorkflowBranch = {
      id: "branch-1",
      name: "experiment",
      workflow_id: "wf-1",
      created_at: new Date().toISOString(),
      description: "Test branch",
      base_version: 5,
      is_active: false
    };

    const mockBranch2: WorkflowBranch = {
      id: "branch-2",
      name: "feature-x",
      workflow_id: "wf-1",
      created_at: new Date().toISOString(),
      description: "Another branch",
      parent_branch_id: "branch-1",
      base_version: 10,
      is_active: true
    };

    test("should add a branch", () => {
      const { result } = renderHook(() => useVersionHistoryStore());

      expect(result.current.branches).toHaveLength(0);

      act(() => {
        result.current.addBranch(mockBranch);
      });

      expect(result.current.branches).toHaveLength(1);
      expect(result.current.branches[0]).toEqual(mockBranch);
    });

    test("should set multiple branches", () => {
      const { result } = renderHook(() => useVersionHistoryStore());

      act(() => {
        result.current.setBranches([mockBranch, mockBranch2]);
      });

      expect(result.current.branches).toHaveLength(2);
      expect(result.current.branches).toEqual([mockBranch, mockBranch2]);
    });

    test("should remove a branch", () => {
      const { result } = renderHook(() => useVersionHistoryStore());

      act(() => {
        result.current.setBranches([mockBranch, mockBranch2]);
      });

      expect(result.current.branches).toHaveLength(2);

      act(() => {
        result.current.removeBranch("branch-1");
      });

      expect(result.current.branches).toHaveLength(1);
      expect(result.current.branches[0].id).toBe("branch-2");
    });

    test("should set current branch", () => {
      const { result } = renderHook(() => useVersionHistoryStore());

      expect(result.current.currentBranchId).toBe(null);

      act(() => {
        result.current.setCurrentBranch("branch-1");
      });

      expect(result.current.currentBranchId).toBe("branch-1");
    });

    test("should clear current branch when removing active branch", () => {
      const { result } = renderHook(() => useVersionHistoryStore());

      act(() => {
        result.current.setBranches([mockBranch]);
        result.current.setCurrentBranch("branch-1");
      });

      expect(result.current.currentBranchId).toBe("branch-1");

      act(() => {
        result.current.removeBranch("branch-1");
      });

      expect(result.current.currentBranchId).toBe(null);
    });

    test("should manage creating branch state", () => {
      const { result } = renderHook(() => useVersionHistoryStore());

      expect(result.current.isCreatingBranch).toBe(false);

      act(() => {
        result.current.setCreatingBranch(true);
      });

      expect(result.current.isCreatingBranch).toBe(true);

      act(() => {
        result.current.setCreatingBranch(false);
      });

      expect(result.current.isCreatingBranch).toBe(false);
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
    test("should clear all state including branches", () => {
      const { result } = renderHook(() => useVersionHistoryStore());

      act(() => {
        result.current.setSelectedVersion("v1");
        result.current.setCompareVersion("v2");
        result.current.setCompareMode(true);
        result.current.setHistoryPanelOpen(true);
        result.current.setViewMode("timeline");
        result.current.incrementEditCount("wf1");
        result.current.updateLastAutosaveTime("wf1");
        result.current.setBranches([{
          id: "branch-1",
          name: "test",
          workflow_id: "wf1",
          created_at: new Date().toISOString(),
          base_version: 1,
          is_active: false
        }]);
        result.current.setCurrentBranch("branch-1");
      });

      expect(result.current.selectedVersionId).toBe("v1");
      expect(result.current.compareVersionId).toBe("v2");
      expect(result.current.isCompareMode).toBe(true);
      expect(result.current.isHistoryPanelOpen).toBe(true);
      expect(result.current.viewMode).toBe("timeline");
      expect(result.current.getEditCount("wf1")).toBe(1);
      expect(result.current.getLastAutosaveTime("wf1")).toBeGreaterThan(0);
      expect(result.current.branches).toHaveLength(1);
      expect(result.current.currentBranchId).toBe("branch-1");

      act(() => {
        result.current.clearState();
      });

      expect(result.current.selectedVersionId).toBe(null);
      expect(result.current.compareVersionId).toBe(null);
      expect(result.current.isCompareMode).toBe(false);
      expect(result.current.isHistoryPanelOpen).toBe(false);
      expect(result.current.viewMode).toBe("list");
      expect(result.current.branches).toHaveLength(0);
      expect(result.current.currentBranchId).toBe(null);
      expect(result.current.isCreatingBranch).toBe(false);
    });
  });
});
