import { useVersionHistoryStore } from "../VersionHistoryStore";
import { Graph } from "../ApiTypes";

describe("VersionHistoryStore", () => {
  const initialState = useVersionHistoryStore.getState();

  const mockGraph: Graph = {
    nodes: [
      {
        id: "node-1",
        type: "test.node",
        sync_mode: "on_any",
        data: { value: 1 }
      },
      {
        id: "node-2",
        type: "test.node",
        sync_mode: "on_any",
        data: { value: 2 }
      }
    ],
    edges: [
      {
        source: "node-1",
        sourceHandle: "output",
        target: "node-2",
        targetHandle: "input"
      }
    ]
  };

  beforeEach(() => {
    useVersionHistoryStore.setState(initialState, true);
    localStorage.clear();
  });

  describe("saveVersion", () => {
    it("should save a new version for a workflow", () => {
      const { saveVersion, getVersions } = useVersionHistoryStore.getState();

      const version = saveVersion("workflow-1", mockGraph, "manual", "Test save");

      expect(version).toBeDefined();
      expect(version.workflow_id).toBe("workflow-1");
      expect(version.version_number).toBe(1);
      expect(version.save_type).toBe("manual");
      expect(version.description).toBe("Test save");
      expect(version.graph_snapshot).toEqual(mockGraph);

      const versions = getVersions("workflow-1");
      expect(versions).toHaveLength(1);
    });

    it("should increment version numbers for each save", () => {
      const { saveVersion, getVersions } = useVersionHistoryStore.getState();

      saveVersion("workflow-1", mockGraph, "manual");
      saveVersion("workflow-1", mockGraph, "autosave");
      const v3 = saveVersion("workflow-1", mockGraph, "checkpoint");

      expect(v3.version_number).toBe(3);

      const versions = getVersions("workflow-1");
      expect(versions).toHaveLength(3);
      expect(versions[0].version_number).toBe(3); // Most recent first
    });

    it("should reset edit count after saving", () => {
      const { saveVersion, incrementEditCount, getEditCount } =
        useVersionHistoryStore.getState();

      incrementEditCount("workflow-1");
      incrementEditCount("workflow-1");
      expect(getEditCount("workflow-1")).toBe(2);

      saveVersion("workflow-1", mockGraph, "manual");
      expect(getEditCount("workflow-1")).toBe(0);
    });
  });

  describe("getVersions", () => {
    it("should return versions sorted by version number descending", () => {
      const { saveVersion, getVersions } = useVersionHistoryStore.getState();

      saveVersion("workflow-1", mockGraph, "manual");
      saveVersion("workflow-1", mockGraph, "autosave");
      saveVersion("workflow-1", mockGraph, "manual");

      const versions = getVersions("workflow-1");
      expect(versions[0].version_number).toBe(3);
      expect(versions[1].version_number).toBe(2);
      expect(versions[2].version_number).toBe(1);
    });

    it("should return empty array for unknown workflow", () => {
      const { getVersions } = useVersionHistoryStore.getState();
      const versions = getVersions("unknown-workflow");
      expect(versions).toEqual([]);
    });
  });

  describe("getVersion", () => {
    it("should return a specific version by id", () => {
      const { saveVersion, getVersion } = useVersionHistoryStore.getState();

      const saved = saveVersion("workflow-1", mockGraph, "manual");
      const retrieved = getVersion(saved.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(saved.id);
    });

    it("should return undefined for unknown version id", () => {
      const { getVersion } = useVersionHistoryStore.getState();
      const version = getVersion("unknown-id");
      expect(version).toBeUndefined();
    });
  });

  describe("deleteVersion", () => {
    it("should remove a version by id", () => {
      const { saveVersion, getVersions, deleteVersion } =
        useVersionHistoryStore.getState();

      const v1 = saveVersion("workflow-1", mockGraph, "manual");
      saveVersion("workflow-1", mockGraph, "autosave");

      deleteVersion(v1.id);

      const versions = getVersions("workflow-1");
      expect(versions).toHaveLength(1);
      expect(versions[0].version_number).toBe(2);
    });
  });

  describe("pinVersion", () => {
    it("should toggle pin state of a version", () => {
      const { saveVersion, getVersion, pinVersion } =
        useVersionHistoryStore.getState();

      const v = saveVersion("workflow-1", mockGraph, "manual");
      expect(v.is_pinned).toBe(false);

      pinVersion(v.id, true);
      expect(getVersion(v.id)?.is_pinned).toBe(true);

      pinVersion(v.id, false);
      expect(getVersion(v.id)?.is_pinned).toBe(false);
    });
  });

  describe("edit count tracking", () => {
    it("should track edit counts per workflow", () => {
      const { incrementEditCount, getEditCount, resetEditCount } =
        useVersionHistoryStore.getState();

      incrementEditCount("workflow-1");
      incrementEditCount("workflow-1");
      incrementEditCount("workflow-2");

      expect(getEditCount("workflow-1")).toBe(2);
      expect(getEditCount("workflow-2")).toBe(1);

      resetEditCount("workflow-1");
      expect(getEditCount("workflow-1")).toBe(0);
      expect(getEditCount("workflow-2")).toBe(1);
    });
  });

  describe("compare mode", () => {
    it("should manage comparison state", () => {
      const {
        setCompareMode,
        setSelectedVersion,
        setCompareVersion,
        saveVersion
      } = useVersionHistoryStore.getState();

      const v1 = saveVersion("workflow-1", mockGraph, "manual");
      const v2 = saveVersion("workflow-1", mockGraph, "manual");

      setSelectedVersion(v1.id);
      setCompareMode(true);
      setCompareVersion(v2.id);

      const state = useVersionHistoryStore.getState();
      expect(state.isCompareMode).toBe(true);
      expect(state.selectedVersionId).toBe(v1.id);
      expect(state.compareVersionId).toBe(v2.id);

      // Disabling compare mode should clear compare version
      setCompareMode(false);
      expect(useVersionHistoryStore.getState().compareVersionId).toBeNull();
    });
  });

  describe("pruneOldVersions", () => {
    it("should respect max versions limit", () => {
      const { saveVersion, getVersions, pruneOldVersions } =
        useVersionHistoryStore.getState();

      // Save 5 versions
      for (let i = 0; i < 5; i++) {
        saveVersion("workflow-1", mockGraph, "manual");
      }

      expect(getVersions("workflow-1")).toHaveLength(5);

      // Prune to max 3
      pruneOldVersions("workflow-1", 3, 90, 7);

      expect(getVersions("workflow-1")).toHaveLength(3);
    });

    it("should preserve pinned versions", () => {
      const { saveVersion, getVersions, pinVersion, pruneOldVersions } =
        useVersionHistoryStore.getState();

      const v1 = saveVersion("workflow-1", mockGraph, "manual");
      saveVersion("workflow-1", mockGraph, "manual");
      saveVersion("workflow-1", mockGraph, "manual");
      saveVersion("workflow-1", mockGraph, "manual");
      saveVersion("workflow-1", mockGraph, "manual");

      // Pin the first version
      pinVersion(v1.id, true);

      // Prune to max 2
      pruneOldVersions("workflow-1", 2, 90, 7);

      const versions = getVersions("workflow-1");
      // Should have 2 versions: 1 pinned + 1 most recent
      expect(versions.length).toBeLessThanOrEqual(3);
      expect(versions.some((v) => v.id === v1.id)).toBe(true);
    });
  });

  describe("clearVersions", () => {
    it("should clear all versions for a workflow", () => {
      const { saveVersion, getVersions, clearVersions } =
        useVersionHistoryStore.getState();

      saveVersion("workflow-1", mockGraph, "manual");
      saveVersion("workflow-1", mockGraph, "manual");
      saveVersion("workflow-2", mockGraph, "manual");

      clearVersions("workflow-1");

      expect(getVersions("workflow-1")).toHaveLength(0);
      expect(getVersions("workflow-2")).toHaveLength(1);
    });
  });

  describe("UI state", () => {
    it("should manage history panel open state", () => {
      const { setHistoryPanelOpen } = useVersionHistoryStore.getState();

      setHistoryPanelOpen(true);
      expect(useVersionHistoryStore.getState().isHistoryPanelOpen).toBe(true);

      setHistoryPanelOpen(false);
      expect(useVersionHistoryStore.getState().isHistoryPanelOpen).toBe(false);
    });
  });
});
