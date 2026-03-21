import { create } from "zustand";

type NodeError = Error | string | null | Record<string, unknown>;

type ErrorStore = {
  errors: Record<string, NodeError>;
  clearErrors: (workflowId: string, nodeIds?: Set<string>) => void;
  clearNodeErrors: (workflowId: string, nodeId: string) => void;
  setError: (workflowId: string, nodeId: string, error: NodeError) => void;
  getError: (workflowId: string, nodeId: string) => NodeError;
};

const hashKey = (workflowId: string, nodeId: string) =>
  `${workflowId}:${nodeId}`;

const useErrorStore = create<ErrorStore>((set, get) => ({
  errors: {},
  /**
   * Clear the errors for a workflow.
   * If nodeIds is provided, only clears errors for those specific nodes.
   *
   * @param workflowId The id of the workflow.
   * @param nodeIds Optional set of node IDs to clear. If omitted, clears all nodes in the workflow.
   */
  clearErrors: (workflowId: string, nodeIds?: Set<string>) => {
    if (nodeIds) {
      const keysToRemove = new Set(
        Array.from(nodeIds).map((id) => hashKey(workflowId, id))
      );
      set((state) => ({
        errors: Object.fromEntries(
          Object.entries(state.errors).filter(
            ([key]) => !keysToRemove.has(key)
          )
        )
      }));
    } else {
      set((state) => ({
        errors: Object.fromEntries(
          Object.entries(state.errors).filter(
            ([key]) => !key.startsWith(workflowId)
          )
        )
      }));
    }
  },
  /**
   * Clear the errors for a specific node.
   */
  clearNodeErrors: (workflowId: string, nodeId: string) => {
    const key = hashKey(workflowId, nodeId);
    set((state) => {
      const { [key]: removed, ...remainingErrors } = state.errors;
      return { errors: remainingErrors };
    });
  },
  /**
   * Set the error for a node.
   * The error is stored in the errors map.
   *
   * @param workflowId The id of the workflow.
   * @param nodeId The id of the node.
   * @param error The error to set.
   */
  setError: (workflowId: string, nodeId: string, error: NodeError) => {
    const key = hashKey(workflowId, nodeId);
    set((state) => ({
      errors: { ...state.errors, [key]: error }
    }));
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
