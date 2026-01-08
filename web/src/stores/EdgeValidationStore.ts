import { create } from "zustand";
import { Edge } from "@xyflow/react";

export type ValidationSeverity = "error" | "warning" | "info";

export interface EdgeValidationIssue {
  edgeId: string;
  sourceId: string;
  targetId: string;
  sourceHandle: string | null;
  targetHandle: string | null;
  severity: ValidationSeverity;
  message: string;
  code: "missing_source_node" | "missing_target_node" | "invalid_source_handle" | "invalid_target_handle" | "potential_cycle" | "orphaned_edge";
}

export interface EdgeValidationResult {
  workflowId: string;
  timestamp: Date;
  issues: EdgeValidationIssue[];
  isValid: boolean;
  edgeCount: number;
  issueCount: number;
}

interface EdgeValidationStore {
  validations: Record<string, EdgeValidationResult>;
  getValidation: (workflowId: string) => EdgeValidationResult | null;
  setValidation: (workflowId: string, result: EdgeValidationResult) => void;
  clearValidation: (workflowId: string) => void;
  clearAllValidations: () => void;
}

const useEdgeValidationStore = create<EdgeValidationStore>((set, get) => ({
  validations: {},

  getValidation: (workflowId: string) => {
    return get().validations[workflowId] || null;
  },

  setValidation: (workflowId: string, result: EdgeValidationResult) => {
    set((state) => ({
      validations: {
        ...state.validations,
        [workflowId]: result
      }
    }));
  },

  clearValidation: (workflowId: string) => {
    set((state) => {
      const { [workflowId]: _, ...rest } = state.validations;
      return { validations: rest };
    });
  },

  clearAllValidations: () => {
    set({ validations: {} });
  }
}));

export default useEdgeValidationStore;
