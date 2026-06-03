import { create } from "zustand";

interface ErrorObject {
  message?: string;
  [key: string]: unknown;
}

type NodeError = Error | string | null | ErrorObject;

type ErrorStore = {
  errors: Record<string, NodeError>;
  clearErrors: (workflowId: string, nodeIds?: Set<string>) => void;
  clearNodeErrors: (workflowId: string, nodeId: string) => void;
  setError: (
    workflowId: string,
    jobId: string,
    nodeId: string,
    error: NodeError
  ) => void;
  getError: (workflowId: string, jobId: string, nodeId: string) => NodeError;
};

const hashKey = (workflowId: string, jobId: string, nodeId: string) =>
  `${workflowId}:${jobId}:${nodeId}`;

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
      const prefix = `${workflowId}:`;
      const suffixes = Array.from(nodeIds).map((id) => `:${id}`);
      set((state) => {
        // Keys are `${wf}:${job}:${node}`; the node is the final segment, so
        // match on the wf prefix AND the `:${node}` suffix to clear that node
        // across all of the workflow's jobs.
        const newErrors = { ...state.errors };
        for (const key in newErrors) {
          if (
            key.startsWith(prefix) &&
            suffixes.some((suffix) => key.endsWith(suffix))
          ) {
            delete newErrors[key];
          }
        }
        return { errors: newErrors };
      });
    } else {
      set((state) => {
        // Optimization: Use for...in loop to avoid intermediate array allocation.
        // Match on the colon boundary to avoid clearing entries for workflows
        // whose IDs happen to share a prefix.
        const prefix = `${workflowId}:`;
        const newErrors: Record<string, NodeError> = {};
        for (const key in state.errors) {
          if (!key.startsWith(prefix)) {
            newErrors[key] = state.errors[key];
          }
        }
        return { errors: newErrors };
      });
    }
  },
  /**
   * Clear the errors for a specific node across all of the workflow's jobs.
   */
  clearNodeErrors: (workflowId: string, nodeId: string) => {
    const prefix = `${workflowId}:`;
    const suffix = `:${nodeId}`;
    set((state) => {
      const newErrors = { ...state.errors };
      let changed = false;
      for (const key in newErrors) {
        if (key.startsWith(prefix) && key.endsWith(suffix)) {
          delete newErrors[key];
          changed = true;
        }
      }
      return changed ? { errors: newErrors } : state;
    });
  },
  /**
   * Set the error for a node within a specific job.
   * The error is stored in the errors map.
   *
   * @param workflowId The id of the workflow.
   * @param jobId The id of the run/job.
   * @param nodeId The id of the node.
   * @param error The error to set.
   */
  setError: (
    workflowId: string,
    jobId: string,
    nodeId: string,
    error: NodeError
  ) => {
    const key = hashKey(workflowId, jobId, nodeId);
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
   * Get the error for a node within a specific job.
   *
   * @param workflowId The id of the workflow.
   * @param jobId The id of the run/job.
   * @param nodeId The id of the node.
   * @returns The error for the node.
   */
  getError: (workflowId: string, jobId: string, nodeId: string) => {
    const errors = get().errors;
    const key = hashKey(workflowId, jobId, nodeId);
    return errors[key];
  }
}));

export default useErrorStore;
