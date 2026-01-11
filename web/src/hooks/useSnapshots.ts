import { Node, Edge } from "@xyflow/react";
import { useSnapshotStore, WorkflowSnapshot } from "../stores/SnapshotStore";

interface UseSnapshotsReturn {
  addSnapshot: (
    workflowId: string,
    name: string,
    description: string | undefined,
    nodes: Node[],
    edges: Edge[]
  ) => WorkflowSnapshot;
  deleteSnapshot: (snapshotId: string) => void;
  getSnapshotsForWorkflow: (workflowId: string) => WorkflowSnapshot[];
  getSnapshot: (snapshotId: string) => WorkflowSnapshot | undefined;
  clearSnapshotsForWorkflow: (workflowId: string) => void;
  snapshots: WorkflowSnapshot[];
}

export const useSnapshots = (): UseSnapshotsReturn => {
  const addSnapshot = useSnapshotStore((state) => state.addSnapshot);
  const deleteSnapshot = useSnapshotStore((state) => state.deleteSnapshot);
  const getSnapshotsForWorkflow = useSnapshotStore((state) =>
    state.getSnapshotsForWorkflow
  );
  const getSnapshot = useSnapshotStore((state) => state.getSnapshot);
  const clearSnapshotsForWorkflow = useSnapshotStore((state) =>
    state.clearSnapshotsForWorkflow
  );
  const snapshots = useSnapshotStore((state) => state.snapshots);

  return {
    addSnapshot,
    deleteSnapshot,
    getSnapshotsForWorkflow,
    getSnapshot,
    clearSnapshotsForWorkflow,
    snapshots,
  };
};

export type { WorkflowSnapshot };
export default useSnapshots;
