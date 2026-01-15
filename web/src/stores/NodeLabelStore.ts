/**
 * NodeLabelStore
 *
 * Manages color-coded labels for nodes in workflows.
 * Allows users to organize and visually distinguish nodes by category.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { uuidv4 } from "./uuidv4";

export interface NodeLabel {
  id: string;
  name: string;
  color: string;
}

export interface NodeLabelAssignment {
  nodeId: string;
  labelIds: string[];
}

export interface NodeLabelState {
  labels: Record<string, NodeLabel>;
  assignments: Record<string, string[]>;
  labelOrder: string[];

  // Actions
  createLabel: (name: string, color: string) => string;
  updateLabel: (id: string, name: string, color: string) => void;
  deleteLabel: (id: string) => void;
  assignLabel: (nodeId: string, labelId: string) => void;
  removeLabel: (nodeId: string, labelId: string) => void;
  clearLabels: (nodeId: string) => void;
  getLabelsForNode: (nodeId: string) => NodeLabel[];
  getNodesWithLabel: (labelId: string) => string[];
  isNodeLabeled: (nodeId: string) => boolean;
}

const DEFAULT_LABELS: NodeLabel[] = [
  { id: "label-red", name: "Important", color: "#ef4444" },
  { id: "label-orange", name: "Review", color: "#f97316" },
  { id: "label-yellow", name: "Warning", color: "#eab308" },
  { id: "label-green", name: "Done", color: "#22c55e" },
  { id: "label-blue", name: "Input", color: "#3b82f6" },
  { id: "label-purple", name: "Output", color: "#a855f7" },
];

export const useNodeLabelStore = create<NodeLabelState>()(
  persist(
    (set, get) => ({
      labels: DEFAULT_LABELS.reduce(
        (acc, label) => ({ ...acc, [label.id]: label }),
        {}
      ),
      assignments: {},
      labelOrder: DEFAULT_LABELS.map((l) => l.id),

      createLabel: (name: string, color: string) => {
        const id = `label-${uuidv4()}`;
        set((state) => ({
          labels: {
            ...state.labels,
            [id]: { id, name, color },
          },
          labelOrder: [...state.labelOrder, id],
        }));
        return id;
      },

      updateLabel: (id: string, name: string, color: string) => {
        set((state) => ({
          labels: {
            ...state.labels,
            [id]: { ...state.labels[id], name, color },
          },
        }));
      },

      deleteLabel: (id: string) => {
        set((state) => {
          const newLabels = { ...state.labels };
          delete newLabels[id];
          const newAssignments = { ...state.assignments };
          for (const nodeId of Object.keys(newAssignments)) {
            newAssignments[nodeId] = newAssignments[nodeId].filter(
              (lid) => lid !== id
            );
          }
          return {
            labels: newLabels,
            assignments: newAssignments,
            labelOrder: state.labelOrder.filter((lid) => lid !== id),
          };
        });
      },

      assignLabel: (nodeId: string, labelId: string) => {
        set((state) => {
          const currentLabels = state.assignments[nodeId] || [];
          if (currentLabels.includes(labelId)) {
            return state;
          }
          return {
            assignments: {
              ...state.assignments,
              [nodeId]: [...currentLabels, labelId],
            },
          };
        });
      },

      removeLabel: (nodeId: string, labelId: string) => {
        set((state) => {
          const currentLabels = state.assignments[nodeId] || [];
          return {
            assignments: {
              ...state.assignments,
              [nodeId]: currentLabels.filter((id) => id !== labelId),
            },
          };
        });
      },

      clearLabels: (nodeId: string) => {
        set((state) => {
          const newAssignments = { ...state.assignments };
          delete newAssignments[nodeId];
          return { assignments: newAssignments };
        });
      },

      getLabelsForNode: (nodeId: string) => {
        const state = get();
        const labelIds = state.assignments[nodeId] || [];
        return labelIds
          .map((id) => state.labels[id])
          .filter(Boolean);
      },

      getNodesWithLabel: (labelId: string) => {
        const state = get();
        return Object.entries(state.assignments)
          .filter(([, labels]) => labels.includes(labelId))
          .map(([nodeId]) => nodeId);
      },

      isNodeLabeled: (nodeId: string) => {
        const state = get();
        const labelIds = state.assignments[nodeId] || [];
        return labelIds.length > 0;
      },
    }),
    {
      name: "node-labels",
    }
  )
);
