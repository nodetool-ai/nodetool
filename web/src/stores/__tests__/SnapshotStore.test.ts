import { renderHook, act } from "@testing-library/react";
import { useSnapshotStore } from "../../stores/SnapshotStore";
import useSnapshots from "../../hooks/useSnapshots";
import { Node, Edge } from "@xyflow/react";

const createMockNodes = (count: number): Node[] => {
  return Array.from({ length: count }, (_, i) => ({
    id: `node-${i}`,
    type: "default" as const,
    position: { x: i * 100, y: i * 100 },
    data: { label: `Node ${i}` },
    selected: false,
    dragging: false,
    computed: undefined,
    measured: undefined,
    parentId: undefined,
    extent: undefined,
    handleBounds: undefined,
    zIndex: 0,
    dragHandle: undefined,
    width: undefined,
    height: undefined,
    expanded: undefined,
  }));
};

const createMockEdges = (count: number): Edge[] => {
  return Array.from({ length: count }, (_, i) => ({
    id: `edge-${i}`,
    type: "default" as const,
    source: `node-${i}`,
    target: `node-${i + 1}`,
    sourceHandle: undefined,
    targetHandle: undefined,
    selected: false,
    animated: false,
  }));
};

describe("SnapshotStore", () => {
  beforeEach(() => {
    useSnapshotStore.setState({ snapshots: [] });
  });

  describe("addSnapshot", () => {
    it("should add a snapshot with correct structure", () => {
      const nodes = createMockNodes(2);
      const edges = createMockEdges(1);
      const workflowId = "workflow-1";

      const snapshot = useSnapshotStore.getState().addSnapshot(
        workflowId,
        "Test Snapshot",
        "Test description",
        nodes,
        edges
      );

      expect(snapshot).toMatchObject({
        name: "Test Snapshot",
        description: "Test description",
        workflowId,
        nodes: expect.any(Array),
        edges: expect.any(Array),
      });
      expect(snapshot.id).toMatch(/^snapshot_/);
      expect(snapshot.timestamp).toBeDefined();
      expect(useSnapshotStore.getState().snapshots).toHaveLength(1);
    });

    it("should handle empty nodes and edges", () => {
      const snapshot = useSnapshotStore.getState().addSnapshot(
        "workflow-1",
        "Empty Snapshot",
        undefined,
        [],
        []
      );

      expect(snapshot.nodes).toHaveLength(0);
      expect(snapshot.edges).toHaveLength(0);
    });

    it("should persist nodes and edges data", () => {
      const nodes = createMockNodes(3);
      const edges = createMockEdges(2);
      const workflowId = "workflow-2";

      const snapshot = useSnapshotStore.getState().addSnapshot(
        workflowId,
        "Data Test",
        "With data",
        nodes,
        edges
      );

      expect(snapshot.nodes).toHaveLength(3);
      expect(snapshot.edges).toHaveLength(2);
      expect(snapshot.nodes[0].id).toBe("node-0");
      expect(snapshot.nodes[0].data.workflow_id).toBeUndefined();
      expect(snapshot.edges[0].source).toBe("node-0");
      expect(snapshot.edges[0].target).toBe("node-1");
    });
  });

  describe("deleteSnapshot", () => {
    it("should delete an existing snapshot", () => {
      const snapshot = useSnapshotStore.getState().addSnapshot(
        "workflow-1",
        "To Delete",
        undefined,
        [],
        []
      );

      expect(useSnapshotStore.getState().snapshots).toHaveLength(1);

      useSnapshotStore.getState().deleteSnapshot(snapshot.id);

      expect(useSnapshotStore.getState().snapshots).toHaveLength(0);
    });

    it("should not affect other snapshots when deleting", () => {
      const snapshot1 = useSnapshotStore.getState().addSnapshot(
        "workflow-1",
        "Snapshot 1",
        undefined,
        [],
        []
      );
      const snapshot2 = useSnapshotStore.getState().addSnapshot(
        "workflow-1",
        "Snapshot 2",
        undefined,
        [],
        []
      );

      useSnapshotStore.getState().deleteSnapshot(snapshot1.id);

      const remaining = useSnapshotStore.getState().snapshots;
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe(snapshot2.id);
    });

    it("should handle non-existent snapshot id gracefully", () => {
      useSnapshotStore.getState().addSnapshot("workflow-1", "Test", undefined, [], []);

      expect(() => {
        useSnapshotStore.getState().deleteSnapshot("non-existent-id");
      }).not.toThrow();
      expect(useSnapshotStore.getState().snapshots).toHaveLength(1);
    });
  });

  describe("getSnapshotsForWorkflow", () => {
    it("should return snapshots for a specific workflow", () => {
      useSnapshotStore.getState().addSnapshot("workflow-1", "W1 S1", undefined, [], []);
      useSnapshotStore.getState().addSnapshot("workflow-2", "W2 S1", undefined, [], []);
      useSnapshotStore.getState().addSnapshot("workflow-1", "W1 S2", undefined, [], []);

      const w1Snapshots = useSnapshotStore.getState().getSnapshotsForWorkflow("workflow-1");
      const w2Snapshots = useSnapshotStore.getState().getSnapshotsForWorkflow("workflow-2");

      expect(w1Snapshots).toHaveLength(2);
      expect(w2Snapshots).toHaveLength(1);
      expect(w1Snapshots.every(s => s.workflowId === "workflow-1")).toBe(true);
      expect(w2Snapshots.every(s => s.workflowId === "workflow-2")).toBe(true);
    });

    it("should return empty array for non-existent workflow", () => {
      const snapshots = useSnapshotStore.getState().getSnapshotsForWorkflow("non-existent");
      expect(snapshots).toHaveLength(0);
    });

    it("should return snapshots sorted by timestamp descending", () => {
      useSnapshotStore.getState().addSnapshot("workflow-1", "First", undefined, [], []);
      jest.advanceTimersByTime(100);
      useSnapshotStore.getState().addSnapshot("workflow-1", "Second", undefined, [], []);
      jest.advanceTimersByTime(100);
      useSnapshotStore.getState().addSnapshot("workflow-1", "Third", undefined, [], []);

      const snapshots = useSnapshotStore.getState().getSnapshotsForWorkflow("workflow-1");

      expect(snapshots).toHaveLength(3);
      expect(snapshots[0].name).toBe("Third");
      expect(snapshots[1].name).toBe("Second");
      expect(snapshots[2].name).toBe("First");
    });
  });

  describe("getSnapshot", () => {
    it("should return a specific snapshot by id", () => {
      const added = useSnapshotStore.getState().addSnapshot(
        "workflow-1",
        "Test",
        undefined,
        [],
        []
      );

      const found = useSnapshotStore.getState().getSnapshot(added.id);

      expect(found).toBeDefined();
      expect(found?.name).toBe("Test");
    });

    it("should return undefined for non-existent id", () => {
      const found = useSnapshotStore.getState().getSnapshot("non-existent");
      expect(found).toBeUndefined();
    });
  });

  describe("clearSnapshotsForWorkflow", () => {
    it("should clear all snapshots for a workflow", () => {
      useSnapshotStore.getState().addSnapshot("workflow-1", "W1 S1", undefined, [], []);
      useSnapshotStore.getState().addSnapshot("workflow-2", "W2 S1", undefined, [], []);
      useSnapshotStore.getState().addSnapshot("workflow-1", "W1 S2", undefined, [], []);

      useSnapshotStore.getState().clearSnapshotsForWorkflow("workflow-1");

      expect(useSnapshotStore.getState().snapshots).toHaveLength(1);
      expect(useSnapshotStore.getState().snapshots[0].workflowId).toBe("workflow-2");
    });
  });
});

describe("useSnapshots hook", () => {
  beforeEach(() => {
    useSnapshotStore.setState({ snapshots: [] });
  });

  it("should provide access to snapshot store methods", () => {
    const { result } = renderHook(() => useSnapshots());

    expect(typeof result.current.addSnapshot).toBe("function");
    expect(typeof result.current.deleteSnapshot).toBe("function");
    expect(typeof result.current.getSnapshotsForWorkflow).toBe("function");
    expect(typeof result.current.getSnapshot).toBe("function");
    expect(typeof result.current.clearSnapshotsForWorkflow).toBe("function");
    expect(Array.isArray(result.current.snapshots)).toBe(true);
  });

  it("should add snapshot through hook", () => {
    const { result } = renderHook(() => useSnapshots());

    act(() => {
      result.current.addSnapshot("wf-1", "Hook Test", "Description", [], []);
    });

    expect(result.current.snapshots).toHaveLength(1);
    expect(result.current.snapshots[0].name).toBe("Hook Test");
  });

  it("should delete snapshot through hook", () => {
    const { result } = renderHook(() => useSnapshots());

    let snapshotId: string = "";
    act(() => {
      const snapshot = result.current.addSnapshot("wf-1", "To Delete", undefined, [], []);
      snapshotId = snapshot.id;
    });

    act(() => {
      result.current.deleteSnapshot(snapshotId);
    });

    expect(result.current.snapshots).toHaveLength(0);
  });

  it("should get snapshots for workflow through hook", () => {
    const { result } = renderHook(() => useSnapshots());

    act(() => {
      result.current.addSnapshot("wf-1", "W1 S1", undefined, [], []);
      result.current.addSnapshot("wf-2", "W2 S1", undefined, [], []);
      result.current.addSnapshot("wf-1", "W1 S2", undefined, [], []);
    });

    const w1Snapshots = result.current.getSnapshotsForWorkflow("wf-1");
    expect(w1Snapshots).toHaveLength(2);
  });
});
