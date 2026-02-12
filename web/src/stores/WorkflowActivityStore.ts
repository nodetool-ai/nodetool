import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";
import type { Node } from "@xyflow/react";

/**
 * Represents the status of a workflow execution.
 */
export type ExecutionStatus = "running" | "completed" | "failed" | "cancelled";

/**
 * Represents a single workflow execution activity.
 */
export interface WorkflowExecution {
  /** Unique identifier for this execution */
  id: string;
  /** ID of the workflow that was executed */
  workflowId: string;
  /** Name of the workflow (captured at execution time) */
  workflowName: string;
  /** Timestamp when execution started */
  startTime: Date;
  /** Timestamp when execution completed (null if still running) */
  endTime: Date | null;
  /** Current status of the execution */
  status: ExecutionStatus;
  /** Error message if execution failed */
  errorMessage?: string;
  /** Number of nodes in the workflow at execution time */
  nodeCount: number;
  /** Snapshot of node IDs at execution time */
  nodeIds: string[];
  /** Execution duration in seconds (null until completed) */
  duration?: number;
}

/**
 * State and actions for managing workflow execution activity log.
 * Provides history tracking of workflow runs with search and filtering capabilities.
 */
interface WorkflowActivityState {
  /** All recorded workflow executions, most recent first */
  executions: WorkflowExecution[];

  /** Start tracking a new workflow execution */
  startExecution: (
    workflowId: string,
    workflowName: string,
    nodes: Node[]
  ) => string;

  /** Complete an execution with success */
  completeExecution: (executionId: string) => void;

  /** Mark an execution as failed */
  failExecution: (executionId: string, errorMessage: string) => void;

  /** Cancel a running execution */
  cancelExecution: (executionId: string) => void;

  /** Remove a single execution from history */
  removeExecution: (executionId: string) => void;

  /** Clear all execution history */
  clearHistory: () => void;

  /** Get executions for a specific workflow */
  getExecutionsByWorkflow: (workflowId: string) => WorkflowExecution[];

  /** Get recent executions across all workflows */
  getRecentExecutions: (limit?: number) => WorkflowExecution[];

  /** Get failed executions */
  getFailedExecutions: () => WorkflowExecution[];

  /** Search executions by workflow name */
  searchExecutions: (query: string) => WorkflowExecution[];
}

/**
 * Calculate duration between two dates in seconds.
 */
function calculateDuration(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 1000);
}

/**
 * Zustand store for workflow activity and execution history.
 * Persisted to localStorage to maintain history across sessions.
 *
 * @example
 * ```typescript
 * const executions = useWorkflowActivityStore(state => state.executions);
 * const startExecution = useWorkflowActivityStore(state => state.startExecution);
 *
 * // Start tracking an execution
 * const executionId = startExecution(workflowId, workflowName, nodes);
 *
 * // Complete it
 * completeExecution(executionId);
 * ```
 */
export const useWorkflowActivityStore = create<WorkflowActivityState>()(
  persist(
    (set, get) => ({
      executions: [],

      startExecution: (workflowId, workflowName, nodes) => {
        const execution: WorkflowExecution = {
          id: uuidv4(),
          workflowId,
          workflowName,
          startTime: new Date(),
          endTime: null,
          status: "running",
          nodeCount: nodes.length,
          nodeIds: nodes.map((n) => n.id)
        };

        set((state) => ({
          executions: [execution, ...state.executions]
        }));

        return execution.id;
      },

      completeExecution: (executionId) => {
        set((state) => ({
          executions: state.executions.map((exec) =>
            exec.id === executionId
              ? {
                  ...exec,
                  status: "completed" as const,
                  endTime: new Date(),
                  duration: calculateDuration(exec.startTime, new Date())
                }
              : exec
          )
        }));
      },

      failExecution: (executionId, errorMessage) => {
        set((state) => ({
          executions: state.executions.map((exec) =>
            exec.id === executionId
              ? {
                  ...exec,
                  status: "failed" as const,
                  endTime: new Date(),
                  errorMessage,
                  duration: calculateDuration(exec.startTime, new Date())
                }
              : exec
          )
        }));
      },

      cancelExecution: (executionId) => {
        set((state) => ({
          executions: state.executions.map((exec) =>
            exec.id === executionId
              ? {
                  ...exec,
                  status: "cancelled" as const,
                  endTime: new Date(),
                  duration: calculateDuration(exec.startTime, new Date())
                }
              : exec
          )
        }));
      },

      removeExecution: (executionId) => {
        set((state) => ({
          executions: state.executions.filter((exec) => exec.id !== executionId)
        }));
      },

      clearHistory: () => {
        set({ executions: [] });
      },

      getExecutionsByWorkflow: (workflowId) => {
        return get().executions.filter((exec) => exec.workflowId === workflowId);
      },

      getRecentExecutions: (limit = 10) => {
        return get().executions.slice(0, limit);
      },

      getFailedExecutions: () => {
        return get().executions.filter((exec) => exec.status === "failed");
      },

      searchExecutions: (query) => {
        const lowerQuery = query.toLowerCase();
        return get().executions.filter((exec) =>
          exec.workflowName.toLowerCase().includes(lowerQuery)
        );
      }
    }),
    {
      name: "nodetool-workflow-activity",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ executions: state.executions })
    }
  )
);
