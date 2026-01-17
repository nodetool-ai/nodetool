import { create } from "zustand";

export interface NodeWarning {
  nodeId: string;
  type: "missing_input" | "missing_property" | "configuration";
  message: string;
  handle?: string;
  property?: string;
}

export interface ValidationResult {
  hasWarnings: boolean;
  warnings: NodeWarning[];
}

type ValidationStore = {
  warnings: Record<string, NodeWarning[]>;
  clearWarnings: (workflowId: string) => void;
  clearNodeWarnings: (workflowId: string, nodeId: string) => void;
  setWarnings: (workflowId: string, nodeId: string, warnings: NodeWarning[]) => void;
  getWarnings: (workflowId: string, nodeId: string) => NodeWarning[];
  getAllWarnings: (workflowId: string) => NodeWarning[];
  hasWarnings: (workflowId: string, nodeId: string) => boolean;
};

const hashKey = (workflowId: string, nodeId: string) =>
  `${workflowId}:${nodeId}`;

const useValidationStore = create<ValidationStore>((set, get) => ({
  warnings: {},

  clearWarnings: (workflowId: string) => {
    const allWarnings = get().warnings;
    const newWarnings: Record<string, NodeWarning[]> = {};
    for (const key in allWarnings) {
      if (!key.startsWith(`${workflowId}:`)) {
        newWarnings[key] = allWarnings[key];
      }
    }
    set({ warnings: newWarnings });
  },

  clearNodeWarnings: (workflowId: string, nodeId: string) => {
    const allWarnings = get().warnings;
    const key = hashKey(workflowId, nodeId);
    const newWarnings = { ...allWarnings };
    delete newWarnings[key];
    set({ warnings: newWarnings });
  },

  setWarnings: (workflowId: string, nodeId: string, warnings: NodeWarning[]) => {
    const key = hashKey(workflowId, nodeId);
    set({
      warnings: { ...get().warnings, [key]: warnings }
    });
  },

  getWarnings: (workflowId: string, nodeId: string): NodeWarning[] => {
    const allWarnings = get().warnings;
    const key = hashKey(workflowId, nodeId);
    return allWarnings[key] ?? [];
  },

  getAllWarnings: (workflowId: string): NodeWarning[] => {
    const allWarnings = get().warnings;
    const result: NodeWarning[] = [];
    for (const key in allWarnings) {
      if (key.startsWith(`${workflowId}:`)) {
        result.push(...allWarnings[key]);
      }
    }
    return result;
  },

  hasWarnings: (workflowId: string, nodeId: string): boolean => {
    const warnings = get().getWarnings(workflowId, nodeId);
    return warnings.length > 0;
  }
}));

export default useValidationStore;
