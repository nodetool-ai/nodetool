/**
 * ResultsStore manages workflow execution results and streaming data.
 *
 * Keys are scoped by job: `${workflowId}:${jobId}:${id}` where `id` is a node
 * id (or an edge id for the `edges` map). This lets concurrent same-workflow
 * runs keep independent results/progress/edges while the canvas focuses one run
 * at a time (see WorkflowRunsStore). For a single run the focused job is that
 * run, so behavior is unchanged.
 */

import { create } from "zustand";
import { PlanningUpdate, ProviderCost, Task, ToolCallUpdate } from "./ApiTypes";

type ResultsStore = {
  results: Record<string, unknown>;
  outputResults: Record<string, unknown>;
  providerCosts: Record<string, ProviderCost>;
  resultsVersion: number;
  progress: Record<string, { progress: number; total: number; chunk?: string }>;
  edges: Record<string, { status: string; counter?: number }>;
  chunks: Record<string, string>;
  tasks: Record<string, Task>;
  toolCalls: Record<string, ToolCallUpdate>;
  planningUpdates: Record<string, PlanningUpdate>;
  deleteResult: (workflowId: string, jobId: string, nodeId: string) => void;
  clearResults: (workflowId: string, nodeIds?: Set<string>) => void;
  clearOutputResults: (workflowId: string, nodeIds?: Set<string>) => void;
  clearProgress: (workflowId: string, nodeIds?: Set<string>) => void;
  clearToolCalls: (workflowId: string, nodeIds?: Set<string>) => void;
  clearTasks: (workflowId: string, nodeIds?: Set<string>) => void;
  clearChunks: (workflowId: string, nodeIds?: Set<string>) => void;
  clearPlanningUpdates: (workflowId: string, nodeIds?: Set<string>) => void;
  clearEdges: (workflowId: string, edgeIds?: Set<string>) => void;
  setEdge: (
    workflowId: string,
    jobId: string,
    edgeId: string,
    status: string,
    counter?: number
  ) => void;
  getEdge: (
    workflowId: string,
    jobId: string,
    edgeId: string
  ) => { status: string; counter?: number } | undefined;
  setResult: (
    workflowId: string,
    jobId: string,
    nodeId: string,
    result: unknown,
    append?: boolean
  ) => void;
  getResult: (workflowId: string, jobId: string, nodeId: string) => unknown;
  getProviderCost: (
    workflowId: string,
    jobId: string,
    nodeId: string
  ) => ProviderCost | undefined;
  setProviderCost: (
    workflowId: string,
    jobId: string,
    nodeId: string,
    cost: ProviderCost
  ) => void;
  getOutputResult: (
    workflowId: string,
    jobId: string,
    nodeId: string
  ) => unknown;
  setOutputResult: (
    workflowId: string,
    jobId: string,
    nodeId: string,
    result: unknown,
    append?: boolean
  ) => void;
  setTask: (
    workflowId: string,
    jobId: string,
    nodeId: string,
    task: Task
  ) => void;
  getTask: (
    workflowId: string,
    jobId: string,
    nodeId: string
  ) => Task | undefined;
  addChunk: (
    workflowId: string,
    jobId: string,
    nodeId: string,
    chunk: string
  ) => void;
  getChunk: (
    workflowId: string,
    jobId: string,
    nodeId: string
  ) => string | undefined;
  setToolCall: (
    workflowId: string,
    jobId: string,
    nodeId: string,
    toolCall: ToolCallUpdate
  ) => void;
  getToolCall: (
    workflowId: string,
    jobId: string,
    nodeId: string
  ) => ToolCallUpdate | undefined;
  setProgress: (
    workflowId: string,
    jobId: string,
    nodeId: string,
    progress: number,
    total: number,
    chunk?: string
  ) => void;
  getProgress: (
    workflowId: string,
    jobId: string,
    nodeId: string
  ) => { progress: number; total: number; chunk?: string } | undefined;
  getPlanningUpdate: (
    workflowId: string,
    jobId: string,
    nodeId: string
  ) => PlanningUpdate | undefined;
  setPlanningUpdate: (
    workflowId: string,
    jobId: string,
    nodeId: string,
    planningUpdate: PlanningUpdate
  ) => void;
};

export const hashKey = (
  workflowId: string,
  jobId: string,
  nodeId: string
): string => `${workflowId}:${jobId}:${nodeId}`;

/**
 * Filter a record by removing entries matching the given workflow.
 *
 * Keys are `${wf}:${job}:${id}`, so the workflow is the leading prefix and the
 * node/edge id is the final colon-segment.
 *
 * - No specificIds: remove every key with the `${workflowId}:` prefix (all jobs).
 * - With specificIds: remove keys matching the workflow prefix AND ending in
 *   `:${id}` for one of the ids (i.e. that node/edge across all of the
 *   workflow's jobs).
 */
const filterRecord = <T>(
  record: Record<string, T>,
  workflowId: string,
  specificIds?: Set<string>
): Record<string, T> => {
  const prefix = `${workflowId}:`;
  if (specificIds) {
    const suffixes = Array.from(specificIds).map((id) => `:${id}`);
    const newRecord = { ...record };
    for (const key in newRecord) {
      if (
        key.startsWith(prefix) &&
        suffixes.some((suffix) => key.endsWith(suffix))
      ) {
        delete newRecord[key];
      }
    }
    return newRecord;
  }
  // Optimization: Use for...in loop to avoid intermediate array allocation.
  // Match on the colon boundary so workflow IDs that share a prefix don't collide.
  const newRecord: Record<string, T> = {};
  for (const key in record) {
    if (!key.startsWith(prefix)) {
      newRecord[key] = record[key];
    }
  }
  return newRecord;
};

const useResultsStore = create<ResultsStore>((set, get) => ({
  results: {},
  outputResults: {},
  providerCosts: {},
  resultsVersion: 0,
  progress: {},
  chunks: {},
  tasks: {},
  toolCalls: {},
  edges: {},
  planningUpdates: {},
  clearEdges: (workflowId: string, edgeIds?: Set<string>) => {
    set((state) => ({
      edges: filterRecord(state.edges, workflowId, edgeIds)
    }));
  },
  /**
   * Set the planning update for a node.
   * The planning update is stored in the planningUpdates map.
   */
  setPlanningUpdate: (
    workflowId: string,
    jobId: string,
    nodeId: string,
    planningUpdate: PlanningUpdate
  ) => {
    set((state) => ({
      planningUpdates: {
        ...state.planningUpdates,
        [hashKey(workflowId, jobId, nodeId)]: planningUpdate
      }
    }));
  },
  /**
   * Get the planning update for a node.
   * The planning update is stored in the planningUpdates map.
   */
  getPlanningUpdate: (workflowId: string, jobId: string, nodeId: string) => {
    return get().planningUpdates[hashKey(workflowId, jobId, nodeId)];
  },
  /**
   * Set the status for an edge.
   * The edge is stored in the edges map.
   */
  setEdge: (
    workflowId: string,
    jobId: string,
    edgeId: string,
    status: string,
    counter?: number
  ) => {
    const key = hashKey(workflowId, jobId, edgeId);
    const existing = get().edges[key];
    const newCounter = counter !== undefined ? counter : existing?.counter;
    if (existing && existing.status === status && existing.counter === newCounter) return;
    set((state) => ({
      edges: {
        ...state.edges,
        [key]: { status, counter: newCounter }
      }
    }));
  },
  /**
   * Get the status for an edge.
   * The edge is stored in the edges map.
   */
  getEdge: (workflowId: string, jobId: string, edgeId: string) => {
    return get().edges[hashKey(workflowId, jobId, edgeId)];
  },
  /**
   * Set the tool call for a node.
   * The tool call is stored in the toolCalls map.
   */
  setToolCall: (
    workflowId: string,
    jobId: string,
    nodeId: string,
    toolCall: ToolCallUpdate
  ) => {
    set((state) => ({
      toolCalls: {
        ...state.toolCalls,
        [hashKey(workflowId, jobId, nodeId)]: toolCall
      }
    }));
  },
  /**
   * Get the tool call for a node.
   * The tool call is stored in the toolCalls map.
   */
  getToolCall: (workflowId: string, jobId: string, nodeId: string) => {
    return get().toolCalls[hashKey(workflowId, jobId, nodeId)];
  },
  /**
   * Set the task for a node.
   * The task is stored in the tasks map.
   */
  setTask: (workflowId: string, jobId: string, nodeId: string, task: Task) => {
    set((state) => ({
      tasks: { ...state.tasks, [hashKey(workflowId, jobId, nodeId)]: task }
    }));
  },
  /**
   * Get the task for a node.
   * The task is stored in the tasks map.
   */
  getTask: (workflowId: string, jobId: string, nodeId: string) => {
    return get().tasks[hashKey(workflowId, jobId, nodeId)];
  },
  /**
   * Delete the result for a node.
   * The result is removed from the results map.
   *
   * @param workflowId The id of the workflow.
   * @param jobId The id of the run/job.
   * @param nodeId The id of the node.
   */
  deleteResult: (workflowId: string, jobId: string, nodeId: string) => {
    const key = hashKey(workflowId, jobId, nodeId);
    set((state) => {
      const { [key]: removed, ...remainingResults } = state.results;
      return { results: remainingResults };
    });
  },
  /**
   * Clear the results for a workflow.
   * The results are removed from the results map.
   */
  clearResults: (workflowId: string, nodeIds?: Set<string>) => {
    set((state) => ({
      results: filterRecord(state.results, workflowId, nodeIds),
      providerCosts: filterRecord(state.providerCosts, workflowId, nodeIds)
    }));
  },
  clearOutputResults: (workflowId: string, nodeIds?: Set<string>) => {
    set((state) => ({
      outputResults: filterRecord(state.outputResults, workflowId, nodeIds)
    }));
  },
  /**
   * Clear the progress for a workflow.
   */
  clearProgress: (workflowId: string, nodeIds?: Set<string>) => {
    set((state) => ({
      progress: filterRecord(state.progress, workflowId, nodeIds)
    }));
  },
  /**
   * Clear the tool calls for a workflow.
   */
  clearToolCalls: (workflowId: string, nodeIds?: Set<string>) => {
    set((state) => ({
      toolCalls: filterRecord(state.toolCalls, workflowId, nodeIds)
    }));
  },
  /**
   * Clear the tasks for a workflow.
   */
  clearTasks: (workflowId: string, nodeIds?: Set<string>) => {
    set((state) => ({
      tasks: filterRecord(state.tasks, workflowId, nodeIds)
    }));
  },
  /**
   * Clear the planning updates for a workflow.
   */
  clearPlanningUpdates: (workflowId: string, nodeIds?: Set<string>) => {
    set((state) => ({
      planningUpdates: filterRecord(state.planningUpdates, workflowId, nodeIds)
    }));
  },
  /**
   * Clear the chunks for a workflow.
   */
  clearChunks: (workflowId: string, nodeIds?: Set<string>) => {
    set((state) => ({
      chunks: filterRecord(state.chunks, workflowId, nodeIds)
    }));
  },
  /**
   * Set the result for a node.
   * The result is stored in the results map.
   *
   * @param workflowId The id of the workflow.
   * @param nodeId The id of the node.
   * @param result The result to set.
   */
  setResult: (
    workflowId: string,
    jobId: string,
    nodeId: string,
    result: unknown,
    append?: boolean
  ) => {
    const key = hashKey(workflowId, jobId, nodeId);
    set((state) => {
      const currentResult = state.results[key];
      const nextVersion = state.resultsVersion + 1;
      if (currentResult === undefined || !append) {
        return { results: { ...state.results, [key]: result }, resultsVersion: nextVersion };
      } else {
        if (Array.isArray(currentResult)) {
          return {
            results: {
              ...state.results,
              [key]: [...currentResult, result]
            },
            resultsVersion: nextVersion
          };
        } else {
          return {
            results: {
              ...state.results,
              [key]: [currentResult, result]
            },
            resultsVersion: nextVersion
          };
        }
      }
    });
  },

  /**
   * Get the result for a node.
   *
   * @param workflowId The id of the workflow.
   * @param jobId The id of the run/job.
   * @param nodeId The id of the node.
   * @returns The result for the node.
   */
  getResult: (workflowId: string, jobId: string, nodeId: string) => {
    const results = get().results;
    const key = hashKey(workflowId, jobId, nodeId);
    return results[key];
  },

  setProviderCost: (
    workflowId: string,
    jobId: string,
    nodeId: string,
    cost: ProviderCost
  ) => {
    set((state) => ({
      providerCosts: {
        ...state.providerCosts,
        [hashKey(workflowId, jobId, nodeId)]: cost
      }
    }));
  },

  getProviderCost: (workflowId: string, jobId: string, nodeId: string) => {
    return get().providerCosts[hashKey(workflowId, jobId, nodeId)];
  },

  /**
   * Get the output result for a node (from OutputUpdate messages).
   *
   * @param workflowId The id of the workflow.
   * @param jobId The id of the run/job.
   * @param nodeId The id of the node.
   * @returns The output result for the node.
   */
  getOutputResult: (workflowId: string, jobId: string, nodeId: string) => {
    const outputResults = get().outputResults;
    const key = hashKey(workflowId, jobId, nodeId);
    const result = outputResults[key];
    return result;
  },

  /**
   * Set the output result for a node (from OutputUpdate messages).
   * The result is stored in the outputResults map.
   *
   * @param workflowId The id of the workflow.
   * @param jobId The id of the run/job.
   * @param nodeId The id of the node.
   * @param result The result to set.
   * @param append Whether to append to existing result.
   */
  setOutputResult: (
    workflowId: string,
    jobId: string,
    nodeId: string,
    result: unknown,
    append?: boolean
  ) => {
    const key = hashKey(workflowId, jobId, nodeId);
    set((state) => {
      const currentResult = state.outputResults[key];
      const nextVersion = state.resultsVersion + 1;
      if (currentResult === undefined || !append) {
        return {
          outputResults: { ...state.outputResults, [key]: result },
          resultsVersion: nextVersion
        };
      } else {
        if (Array.isArray(currentResult)) {
          return {
            outputResults: {
              ...state.outputResults,
              [key]: [...currentResult, result]
            },
            resultsVersion: nextVersion
          };
        } else {
          return {
            outputResults: {
              ...state.outputResults,
              [key]: [currentResult, result]
            },
            resultsVersion: nextVersion
          };
        }
      }
    });
  },

  /**
   * Set the progress for a node.
   *
   * @param workflowId The id of the workflow.
   * @param jobId The id of the run/job.
   * @param nodeId The id of the node.
   * @param progress The progress to set.
   * @param total The total to set.
   * @param chunk The chunk in a streaming prediction.
   * @returns The progress and total for the node.
   */
  setProgress: (
    workflowId: string,
    jobId: string,
    nodeId: string,
    progress: number,
    total: number,
    chunk?: string
  ) => {
    const key = hashKey(workflowId, jobId, nodeId);
    set((state) => {
      const currentChunk = state.progress[key]?.chunk || "";
      return {
        progress: {
          ...state.progress,
          [key]: { progress, total, chunk: currentChunk + (chunk || "") }
        }
      };
    });
  },

  /**
   * Get the progress for a node.
   *
   * @param workflowId The id of the workflow.
   * @param jobId The id of the run/job.
   * @param nodeId The id of the node.
   *
   * @returns The progress and total for the node.
   */
  getProgress: (workflowId: string, jobId: string, nodeId: string) => {
    const progress = get().progress;
    const key = hashKey(workflowId, jobId, nodeId);
    return progress[key];
  },
  addChunk: (
    workflowId: string,
    jobId: string,
    nodeId: string,
    chunk: string
  ) => {
    const key = hashKey(workflowId, jobId, nodeId);
    set((state) => {
      const currentChunk = state.chunks[key] || "";
      return { chunks: { ...state.chunks, [key]: currentChunk + chunk } };
    });
  },
  getChunk: (workflowId: string, jobId: string, nodeId: string) => {
    const key = hashKey(workflowId, jobId, nodeId);
    return get().chunks[key];
  }
}));

export default useResultsStore;
