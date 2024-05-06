import { create } from "zustand";

type ErrorStore = {
  errors: Record<string, string>;
  clearErrors: (workflowId: string) => void;
  setError: (workflowId: string, nodeId: string, error: any) => void;
  getError: (workflowId: string, nodeId: string) => any;
};

const hashKey = (workflowId: string, nodeId: string) =>
  `${workflowId}:${nodeId}`;

const useErrorStore = create<ErrorStore>((set, get) => ({
  errors: {},
  /**
   * Clear the errors for a workflow.
   *
   * @param workflowId The id of the workflow.
   */
  clearErrors: (workflowId: string) => {
    const errors = get().errors;
    for (const key in errors) {
      if (key.startsWith(workflowId)) {
        delete errors[key];
      }
    }
    set({ errors });
  },
  /**
   * Set the error for a node.
   * The error is stored in the errors map.
   *
   * @param workflowId The id of the workflow.
   * @param nodeId The id of the node.
   * @param error The error to set.
   */
  setError: (workflowId: string, nodeId: string, error: any) => {
    const key = hashKey(workflowId, nodeId);
    set({ errors: { ...get().errors, [key]: error } });
  },

  /**
   * Get the error for a node.
   *
   * @param workflowId The id of the workflow.
   * @param nodeId The id of the node.
   * @returns The error for the node.
   */
  getError: (workflowId: string, nodeId: string) => {
    const errors = get().errors;
    const key = hashKey(workflowId, nodeId);
    return errors[key];
  }
}));

export default useErrorStore;
