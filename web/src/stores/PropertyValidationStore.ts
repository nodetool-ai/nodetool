import { create } from "zustand";
import { shallow } from "zustand/shallow";

type Key = `${string}:${string}:${string}`;

const key = (workflowId: string, nodeId: string, property: string): Key =>
  `${workflowId}:${nodeId}:${property}` as Key;

const nodePrefix = (workflowId: string, nodeId: string) =>
  `${workflowId}:${nodeId}:`;

export interface NodeValidationError {
  property: string;
  message: string;
}

type PropertyValidationStore = {
  errors: Record<Key, string>;
  setIssues: (
    workflowId: string,
    issues: ReadonlyArray<{
      node_id: string;
      property: string;
      message: string;
    }>
  ) => void;
  clearWorkflow: (workflowId: string) => void;
  clearNode: (workflowId: string, nodeId: string) => void;
  getError: (
    workflowId: string,
    nodeId: string,
    property: string
  ) => string | undefined;
  getNodeErrors: (
    workflowId: string,
    nodeId: string
  ) => NodeValidationError[];
};

const usePropertyValidationStore = create<PropertyValidationStore>(
  (set, get) => ({
    errors: {},
    setIssues: (workflowId, issues) => {
      set((state) => {
        const next: Record<Key, string> = {};
        const prefix = `${workflowId}:`;
        for (const k in state.errors) {
          if (!k.startsWith(prefix)) next[k as Key] = state.errors[k as Key];
        }
        for (const issue of issues) {
          if (!issue.node_id || !issue.property) continue;
          next[key(workflowId, issue.node_id, issue.property)] = issue.message;
        }
        return { errors: next };
      });
    },
    clearWorkflow: (workflowId) => {
      set((state) => {
        const next: Record<Key, string> = {};
        const prefix = `${workflowId}:`;
        for (const k in state.errors) {
          if (!k.startsWith(prefix)) next[k as Key] = state.errors[k as Key];
        }
        return { errors: next };
      });
    },
    clearNode: (workflowId, nodeId) => {
      set((state) => {
        const next: Record<Key, string> = {};
        const prefix = nodePrefix(workflowId, nodeId);
        for (const k in state.errors) {
          if (!k.startsWith(prefix)) next[k as Key] = state.errors[k as Key];
        }
        return { errors: next };
      });
    },
    getError: (workflowId, nodeId, property) =>
      get().errors[key(workflowId, nodeId, property)],
    getNodeErrors: (workflowId, nodeId) => {
      const prefix = nodePrefix(workflowId, nodeId);
      const out: NodeValidationError[] = [];
      const errors = get().errors;
      for (const k in errors) {
        if (k.startsWith(prefix)) {
          out.push({ property: k.slice(prefix.length), message: errors[k as Key] });
        }
      }
      return out;
    }
  })
);

export { shallow };
export default usePropertyValidationStore;
