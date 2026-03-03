/**
 * PathHighlightingStore - Manages workflow execution path visualization.
 *
 * This store tracks which nodes and edges have been executed during a workflow run,
 * enabling visual highlighting of the active execution path. This helps users:
 * - Understand data flow through complex workflows
 * - Debug which nodes actually executed
 * - Identify bottlenecks in the execution path
 * - Verify conditional execution logic
 *
 * @example
 * ```typescript
 * import usePathHighlightingStore from './PathHighlightingStore';
 *
 * const store = usePathHighlightingStore();
 *
 * // When a node starts executing
 * store.markNodeExecuting('workflow-1', 'node-1');
 *
 * // When a node completes
 * store.markNodeCompleted('workflow-1', 'node-1');
 *
 * // Check if a node is in the execution path
 * const isExecuted = store.isNodeExecuted('workflow-1', 'node-1');
 *
 * // Clear path when workflow restarts
 * store.clearPath('workflow-1');
 * ```
 *
 * @experimental This is an experimental feature for workflow path visualization.
 */

import { create } from "zustand";

export type NodeExecutionState = "idle" | "executing" | "completed" | "error";

interface PathHighlightingStore {
  // Whether path highlighting is enabled
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;

  // Execution state of nodes by workflowId:nodeId
  nodeStates: Record<string, NodeExecutionState>;

  // Set of edge IDs that have been executed (by workflowId)
  executedEdges: Record<string, Set<string>>;

  // Mark a node as currently executing
  markNodeExecuting: (workflowId: string, nodeId: string) => void;

  // Mark a node as completed
  markNodeCompleted: (workflowId: string, nodeId: string) => void;

  // Mark a node as error
  markNodeError: (workflowId: string, nodeId: string) => void;

  // Mark an edge as executed (data flowed through it)
  markEdgeExecuted: (workflowId: string, edgeId: string) => void;

  // Check if a node is in the execution path
  isNodeExecuted: (workflowId: string, nodeId: string) => boolean;

  // Check if a node is currently executing
  isNodeExecuting: (workflowId: string, nodeId: string) => boolean;

  // Get node execution state
  getNodeState: (workflowId: string, nodeId: string) => NodeExecutionState;

  // Check if an edge is executed
  isEdgeExecuted: (workflowId: string, edgeId: string) => boolean;

  // Clear all path data for a workflow
  clearPath: (workflowId: string) => void;

  // Clear all path data (for logout/workspace switch)
  clearAll: () => void;
}

const hashKey = (workflowId: string, id: string) => `${workflowId}:${id}`;

const usePathHighlightingStore = create<PathHighlightingStore>((set, get) => ({
  enabled: true,
  nodeStates: {},
  executedEdges: {},

  setEnabled: (enabled: boolean) => {
    set({ enabled });
  },

  markNodeExecuting: (workflowId: string, nodeId: string) => {
    const key = hashKey(workflowId, nodeId);
    set((state) => ({
      nodeStates: {
        ...state.nodeStates,
        [key]: "executing"
      }
    }));
  },

  markNodeCompleted: (workflowId: string, nodeId: string) => {
    const key = hashKey(workflowId, nodeId);
    set((state) => ({
      nodeStates: {
        ...state.nodeStates,
        [key]: "completed"
      }
    }));
  },

  markNodeError: (workflowId: string, nodeId: string) => {
    const key = hashKey(workflowId, nodeId);
    set((state) => ({
      nodeStates: {
        ...state.nodeStates,
        [key]: "error"
      }
    }));
  },

  markEdgeExecuted: (workflowId: string, edgeId: string) => {
    set((state) => {
      const workflowEdges = state.executedEdges[workflowId] || new Set();
      return {
        executedEdges: {
          ...state.executedEdges,
          [workflowId]: new Set([...workflowEdges, edgeId])
        }
      };
    });
  },

  isNodeExecuted: (workflowId: string, nodeId: string) => {
    const key = hashKey(workflowId, nodeId);
    const state = get().nodeStates[key];
    return state === "completed" || state === "error";
  },

  isNodeExecuting: (workflowId: string, nodeId: string) => {
    const key = hashKey(workflowId, nodeId);
    return get().nodeStates[key] === "executing";
  },

  getNodeState: (workflowId: string, nodeId: string) => {
    const key = hashKey(workflowId, nodeId);
    return get().nodeStates[key] || "idle";
  },

  isEdgeExecuted: (workflowId: string, edgeId: string) => {
    const workflowEdges = get().executedEdges[workflowId];
    return workflowEdges ? workflowEdges.has(edgeId) : false;
  },

  clearPath: (workflowId: string) => {
    set((state) => {
      const newNodeStates = Object.fromEntries(
        Object.entries(state.nodeStates).filter(
          ([key]) => !key.startsWith(`${workflowId}:`)
        )
      );
      const newExecutedEdges = { ...state.executedEdges };
      delete newExecutedEdges[workflowId];

      return {
        nodeStates: newNodeStates,
        executedEdges: newExecutedEdges
      };
    });
  },

  clearAll: () => {
    set({
      nodeStates: {},
      executedEdges: {}
    });
  }
}));

export default usePathHighlightingStore;
