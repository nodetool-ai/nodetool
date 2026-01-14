/**
 * NodeLabelStore
 *
 * Manages custom labels/annotations for nodes within workflows.
 * Labels appear as small badges on nodes for workflow documentation.
 * Supports multiple labels per node and label-based filtering.
 *
 * Labels are stored per-workflow to enable:
 * - Label-based search/filtering in FindInWorkflow
 * - Quick visual identification of important nodes
 * - Workflow documentation and organization
 */

import { create } from "zustand";

export interface NodeLabel {
  id: string;
  text: string;
  color: string;
  createdAt: number;
}

export interface WorkflowLabels {
  [nodeId: string]: NodeLabel[];
}

export interface NodeLabelsRecord {
  [workflowId: string]: WorkflowLabels;
}

interface NodeLabelStore {
  labels: NodeLabelsRecord;
  currentWorkflowId: string | null;

  setCurrentWorkflowId: (workflowId: string) => void;

  addLabel: (nodeId: string, text: string, color?: string) => string;

  removeLabel: (nodeId: string, labelId: string) => void;

  updateLabel: (nodeId: string, labelId: string, text: string, color?: string) => void;

  getLabels: (nodeId: string) => NodeLabel[];

  hasLabels: (nodeId: string) => boolean;

  getAllLabels: () => Array<{ nodeId: string; label: NodeLabel }>;

  getNodesWithLabels: () => string[];

  clearLabels: () => void;

  clearWorkflowLabels: () => void;
}

const LABEL_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

const getDefaultColor = (text: string): string => {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % LABEL_COLORS.length;
  return LABEL_COLORS[index];
};

const generateLabelId = (): string => {
  return `label_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

const getWorkflowLabels = (state: NodeLabelStore): WorkflowLabels => {
  if (!state.currentWorkflowId) {
    return {};
  }
  return state.labels[state.currentWorkflowId] || {};
};

const setWorkflowLabels = (
  state: NodeLabelStore,
  workflowLabels: WorkflowLabels
): NodeLabelStore => {
  if (!state.currentWorkflowId) {
    return state;
  }
  return {
    ...state,
    labels: {
      ...state.labels,
      [state.currentWorkflowId]: workflowLabels,
    },
  };
};

export const useNodeLabelStore = create<NodeLabelStore>((set, get) => ({
  labels: {},
  currentWorkflowId: null,

  setCurrentWorkflowId: (workflowId: string) => {
    set({ currentWorkflowId: workflowId });
  },

  addLabel: (nodeId: string, text: string, color?: string) => {
    const labelId = generateLabelId();
    const labelColor = color || getDefaultColor(text);

    set((state) => {
      const workflowLabels = getWorkflowLabels(state);
      const nodeLabels = workflowLabels[nodeId] || [];

      if (nodeLabels.length >= 5) {
        return state;
      }

      const newLabel: NodeLabel = {
        id: labelId,
        text: text.trim().substring(0, 30),
        color: labelColor,
        createdAt: Date.now(),
      };

      const updatedWorkflowLabels = {
        ...workflowLabels,
        [nodeId]: [...nodeLabels, newLabel],
      };

      return setWorkflowLabels(state, updatedWorkflowLabels);
    });

    return labelId;
  },

  removeLabel: (nodeId: string, labelId: string) => {
    set((state) => {
      const workflowLabels = getWorkflowLabels(state);
      const nodeLabels = workflowLabels[nodeId];
      if (!nodeLabels) {
        return state;
      }

      const updatedWorkflowLabels = {
        ...workflowLabels,
        [nodeId]: nodeLabels.filter((label) => label.id !== labelId),
      };

      return setWorkflowLabels(state, updatedWorkflowLabels);
    });
  },

  updateLabel: (nodeId: string, labelId: string, text: string, color?: string) => {
    set((state) => {
      const workflowLabels = getWorkflowLabels(state);
      const nodeLabels = workflowLabels[nodeId];
      if (!nodeLabels) {
        return state;
      }

      const updatedLabels = nodeLabels.map((label) => {
        if (label.id === labelId) {
          return {
            ...label,
            text: text.trim().substring(0, 30),
            color: color || label.color,
          };
        }
        return label;
      });

      const updatedWorkflowLabels = {
        ...workflowLabels,
        [nodeId]: updatedLabels,
      };

      return setWorkflowLabels(state, updatedWorkflowLabels);
    });
  },

  getLabels: (nodeId: string) => {
    const workflowLabels = getWorkflowLabels(get());
    return workflowLabels[nodeId] || [];
  },

  hasLabels: (nodeId: string) => {
    const workflowLabels = getWorkflowLabels(get());
    const labels = workflowLabels[nodeId];
    return labels !== undefined && labels.length > 0;
  },

  getAllLabels: () => {
    const labels: Array<{ nodeId: string; label: NodeLabel }> = [];
    const workflowLabels = getWorkflowLabels(get());

    for (const nodeId in workflowLabels) {
      for (const label of workflowLabels[nodeId]) {
        labels.push({ nodeId, label });
      }
    }

    return labels;
  },

  getNodesWithLabels: () => {
    const workflowLabels = getWorkflowLabels(get());
    return Object.keys(workflowLabels).filter(
      (nodeId) => workflowLabels[nodeId].length > 0
    );
  },

  clearLabels: () => {
    set({ labels: {} });
  },

  clearWorkflowLabels: () => {
    set((state) => {
      if (!state.currentWorkflowId) {
        return state;
      }
      const newLabels = { ...state.labels };
      delete newLabels[state.currentWorkflowId];
      return { labels: newLabels };
    });
  },
}));

export default useNodeLabelStore;
