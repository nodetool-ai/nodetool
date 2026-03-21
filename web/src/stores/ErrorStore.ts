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

export const normalizeNodeError = (
  error: NodeError | undefined
): NodeError | undefined => {
  if (error === null || error === undefined) {
    return undefined;
  }

  if (typeof error === "string") {
    const trimmed = error.trim();
    if (
      trimmed === "" ||
      trimmed.toLowerCase() === "null" ||
      trimmed.toLowerCase() === "undefined"
    ) {
      return undefined;
    }
    return trimmed;
  }

  if (error instanceof Error) {
    return error.message.trim() === "" ? undefined : error;
  }

  return error;
};

export const hasNodeError = (error: NodeError | undefined): boolean =>
  normalizeNodeError(error) !== undefined;

export const nodeErrorToDisplayString = (
  error: NodeError | undefined
): string => {
  const normalized = normalizeNodeError(error);
  if (normalized === undefined) {
    return "";
  }

  if (typeof normalized === "string") {
    return normalized;
  }

  if (normalized instanceof Error) {
    return normalized.message;
  }

  if (
    normalized &&
    typeof normalized === "object" &&
    "message" in normalized
  ) {
    return String(normalized.message);
  }

  return JSON.stringify(normalized);
};

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
      set((state) => {
        // Optimization: Clone and delete specific keys when specificIds is provided
        const newErrors = { ...state.errors };
        keysToRemove.forEach((key) => {
          delete newErrors[key];
        });
        return { errors: newErrors };
      });
    } else {
      set((state) => {
        // Optimization: Use for...in loop to avoid intermediate array allocation
        const newErrors: Record<string, NodeError> = {};
        for (const key in state.errors) {
          if (!key.startsWith(workflowId)) {
            newErrors[key] = state.errors[key];
          }
        }
        return { errors: newErrors };
      });
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
    const normalized = normalizeNodeError(error);
    set((state) => {
      if (normalized === undefined) {
        const { [key]: removed, ...remainingErrors } = state.errors;
        return { errors: remainingErrors };
      }

      return {
        errors: { ...state.errors, [key]: normalized }
      };
    });
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
