import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "./NodeData";

export interface WorkflowSnapshot {
  id: string;
  name: string;
  description?: string;
  timestamp: number;
  nodes: Node<NodeData>[];
  edges: Edge[];
  workflowId: string;
}

interface SnapshotState {
  snapshots: WorkflowSnapshot[];
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
}

const generateId = (): string => {
  return `snapshot_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

export const useSnapshotStore = create<SnapshotState>()(
  persist(
    (set, get) => ({
      snapshots: [],

      addSnapshot: (
        workflowId: string,
        name: string,
        description: string | undefined,
        nodes: Node[],
        edges: Edge[]
      ): WorkflowSnapshot => {
        const snapshot: WorkflowSnapshot = {
          id: generateId(),
          name,
          description,
          timestamp: Date.now(),
          nodes: nodes.map((node) => {
            const nodeWithData = node as Node<NodeData>;
            return {
              id: node.id,
              type: node.type,
              position: { ...node.position },
              data: { ...nodeWithData.data },
              selected: false,
              dragging: false,
              computed: undefined,
              measured: undefined,
              parentId: node.parentId,
              extent: node.extent,
              handleBounds: undefined,
              zIndex: node.zIndex,
              dragHandle: node.dragHandle,
              width: node.width,
              height: node.height,
            };
          }),
          edges: edges.map((edge) => ({
            id: edge.id,
            type: edge.type,
            source: edge.source,
            target: edge.target,
            sourceHandle: edge.sourceHandle,
            targetHandle: edge.targetHandle,
            selected: false,
            animated: false,
            label: edge.label,
            style: edge.style,
          })),
          workflowId,
        };

        set((state) => ({
          snapshots: [...state.snapshots, snapshot],
        }));

        return snapshot;
      },

      deleteSnapshot: (snapshotId: string) => {
        set((state) => ({
          snapshots: state.snapshots.filter((s) => s.id !== snapshotId),
        }));
      },

      getSnapshotsForWorkflow: (workflowId: string): WorkflowSnapshot[] => {
        return get().snapshots
          .filter((s) => s.workflowId === workflowId)
          .sort((a, b) => b.timestamp - a.timestamp);
      },

      getSnapshot: (snapshotId: string): WorkflowSnapshot | undefined => {
        return get().snapshots.find((s) => s.id === snapshotId);
      },

      clearSnapshotsForWorkflow: (workflowId: string) => {
        set((state) => ({
          snapshots: state.snapshots.filter((s) => s.workflowId !== workflowId),
        }));
      },
    }),
    {
      name: "workflow-snapshots",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ snapshots: state.snapshots }),
    }
  )
);
