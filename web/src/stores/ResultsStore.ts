/**
 * ResultsStore manages workflow execution results and streaming data.
 *
 * Responsibilities:
 * - Store node execution results (output values, preview data)
 * - Track streaming progress and accumulated chunks
 * - Manage tool calls and planning updates from the assistant
 * - Handle edge status updates for visual feedback
 * - Provide typed accessors for results organized by workflow and node
 *
 * Data is organized using composite keys: "workflowId:nodeId"
 */

import { create } from "zustand";
import { PlanningUpdate, Task, ToolCallUpdate } from "./ApiTypes";

type ResultsStore = {
  results: Record<string, any>;
  outputResults: Record<string, any>;
  progress: Record<string, { progress: number; total: number; chunk?: string }>;
  edges: Record<string, { status: string; counter?: number }>;
  chunks: Record<string, string>;
  tasks: Record<string, Task>;
  toolCalls: Record<string, ToolCallUpdate>;
  planningUpdates: Record<string, PlanningUpdate>;
  previews: Record<string, any>;
  deleteResult: (workflowId: string, nodeId: string) => void;
  clearResults: (workflowId: string) => void;
  clearOutputResults: (workflowId: string) => void;
  clearProgress: (workflowId: string) => void;
  clearToolCalls: (workflowId: string) => void;
  clearTasks: (workflowId: string) => void;
  clearChunks: (workflowId: string) => void;
  clearPlanningUpdates: (workflowId: string) => void;
  clearPreviews: (workflowId: string) => void;
  clearEdges: (workflowId: string) => void;
  setEdge: (
    workflowId: string,
    edgeId: string,
    status: string,
    counter?: number
  ) => void;
  getEdge: (
    workflowId: string,
    edgeId: string
  ) => { status: string; counter?: number } | undefined;
  setPreview: (
    workflowId: string,
    nodeId: string,
    preview: any,
    append?: boolean
  ) => void;
  getPreview: (workflowId: string, nodeId: string) => any;
  setResult: (
    workflowId: string,
    nodeId: string,
    result: any,
    append?: boolean
  ) => void;
  getResult: (workflowId: string, nodeId: string) => any;
  getOutputResult: (workflowId: string, nodeId: string) => any;
  setOutputResult: (
    workflowId: string,
    nodeId: string,
    result: any,
    append?: boolean
  ) => void;
  setTask: (workflowId: string, nodeId: string, task: Task) => void;
  getTask: (workflowId: string, nodeId: string) => Task | undefined;
  addChunk: (workflowId: string, nodeId: string, chunk: string) => void;
  getChunk: (workflowId: string, nodeId: string) => string | undefined;
  setToolCall: (
    workflowId: string,
    nodeId: string,
    toolCall: ToolCallUpdate
  ) => void;
  getToolCall: (
    workflowId: string,
    nodeId: string
  ) => ToolCallUpdate | undefined;
  setProgress: (
    workflowId: string,
    nodeId: string,
    progress: number,
    total: number,
    chunk?: string
  ) => void;
  getProgress: (
    workflowId: string,
    nodeId: string
  ) => { progress: number; total: number; chunk?: string } | undefined;
  getPlanningUpdate: (
    workflowId: string,
    nodeId: string
  ) => PlanningUpdate | undefined;
  setPlanningUpdate: (
    workflowId: string,
    nodeId: string,
    planningUpdate: PlanningUpdate
  ) => void;
};

export const hashKey = (workflowId: string, nodeId: string) =>
  `${workflowId}:${nodeId}`;

const useResultsStore = create<ResultsStore>((set, get) => ({
  results: {},
  outputResults: {},
  progress: {},
  chunks: {},
  tasks: {},
  toolCalls: {},
  edges: {},
  planningUpdates: {},
  previews: {},
  clearEdges: (workflowId: string) => {
    set((state) => ({
      edges: Object.fromEntries(
        Object.entries(state.edges).filter(
          ([key]) => !key.startsWith(workflowId)
        )
      )
    }));
  },
  /**
   * Set the planning update for a node.
   * The planning update is stored in the planningUpdates map.
   */
  setPlanningUpdate: (
    workflowId: string,
    nodeId: string,
    planningUpdate: PlanningUpdate
  ) => {
    set((state) => ({
      planningUpdates: {
        ...state.planningUpdates,
        [hashKey(workflowId, nodeId)]: planningUpdate
      }
    }));
  },
  /**
   * Set the preview for a node.
   * The preview is stored in the previews map.
   */
  setPreview: (
    workflowId: string,
    nodeId: string,
    preview: any,
    append?: boolean
  ) => {
    const key = hashKey(workflowId, nodeId);
    set((state) => {
      const currentPreview = state.previews[key];
      if (currentPreview === undefined || !append) {
        return {
          previews: { ...state.previews, [key]: preview }
        };
      } else {
        let newPreview;
        if (Array.isArray(currentPreview)) {
          newPreview = [...currentPreview, preview];
        } else {
          newPreview = [currentPreview, preview];
        }
        return {
          previews: {
            ...state.previews,
            [key]: newPreview
          }
        };
      }
    });
  },
  /**
   * Get the preview for a node.
   * The preview is stored in the previews map.
   */
  getPreview: (workflowId: string, nodeId: string) => {
    return get().previews[hashKey(workflowId, nodeId)];
  },
  /**
   * Get the planning update for a node.
   * The planning update is stored in the planningUpdates map.
   */
  getPlanningUpdate: (workflowId: string, nodeId: string) => {
    return get().planningUpdates[hashKey(workflowId, nodeId)];
  },
  /**
   * Set the status for an edge.
   * The edge is stored in the edges map.
   */
  setEdge: (
    workflowId: string,
    edgeId: string,
    status: string,
    counter?: number
  ) => {
    const key = hashKey(workflowId, edgeId);
    set((state) => {
      const existing = state.edges[key];
      const newCounter = counter !== undefined ? counter : existing?.counter;
      return {
        edges: {
          ...state.edges,
          [key]: { status, counter: newCounter }
        }
      };
    });
  },
  /**
   * Get the status for an edge.
   * The edge is stored in the edges map.
   */
  getEdge: (workflowId: string, edgeId: string) => {
    return get().edges[hashKey(workflowId, edgeId)];
  },
  /**
   * Set the tool call for a node.
   * The tool call is stored in the toolCalls map.
   */
  setToolCall: (
    workflowId: string,
    nodeId: string,
    toolCall: ToolCallUpdate
  ) => {
    set((state) => ({
      toolCalls: {
        ...state.toolCalls,
        [hashKey(workflowId, nodeId)]: toolCall
      }
    }));
  },
  /**
   * Get the tool call for a node.
   * The tool call is stored in the toolCalls map.
   */
  getToolCall: (workflowId: string, nodeId: string) => {
    return get().toolCalls[hashKey(workflowId, nodeId)];
  },
  /**
   * Set the task for a node.
   * The task is stored in the tasks map.
   */
  setTask: (workflowId: string, nodeId: string, task: Task) => {
    set((state) => ({
      tasks: { ...state.tasks, [hashKey(workflowId, nodeId)]: task }
    }));
  },
  /**
   * Get the task for a node.
   * The task is stored in the tasks map.
   */
  getTask: (workflowId: string, nodeId: string) => {
    return get().tasks[hashKey(workflowId, nodeId)];
  },
  /**
   * Delete the result for a node.
   * The result is removed from the results map.
   *
   * @param workflowId The id of the workflow.
   * @param nodeId The id of the node.
   */
  deleteResult: (workflowId: string, nodeId: string) => {
    const key = hashKey(workflowId, nodeId);
    set((state) => {
      const { [key]: removed, ...remainingResults } = state.results;
      return { results: remainingResults };
    });
  },
  /**
   * Clear the results for a workflow.
   * The results are removed from the results map.
   */
  clearResults: (workflowId: string) => {
    set((state) => ({
      results: Object.fromEntries(
        Object.entries(state.results).filter(
          ([key]) => !key.startsWith(workflowId)
        )
      )
    }));
  },
  clearOutputResults: (workflowId: string) => {
    set((state) => ({
      outputResults: Object.fromEntries(
        Object.entries(state.outputResults).filter(
          ([key]) => !key.startsWith(workflowId)
        )
      )
    }));
  },
  /**
   * Clear the progress for a workflow.
   */
  clearProgress: (workflowId: string) => {
    set((state) => ({
      progress: Object.fromEntries(
        Object.entries(state.progress).filter(
          ([key]) => !key.startsWith(workflowId)
        )
      )
    }));
  },
  /**
   * Clear the previews for a workflow.
   */
  clearPreviews: (workflowId: string) => {
    set((state) => ({
      previews: Object.fromEntries(
        Object.entries(state.previews).filter(
          ([key]) => !key.startsWith(workflowId)
        )
      )
    }));
  },
  /**
   * Clear the tool calls for a workflow.
   */
  clearToolCalls: (workflowId: string) => {
    set((state) => ({
      toolCalls: Object.fromEntries(
        Object.entries(state.toolCalls).filter(
          ([key]) => !key.startsWith(workflowId)
        )
      )
    }));
  },
  /**
   * Clear the tasks for a workflow.
   */
  clearTasks: (workflowId: string) => {
    set((state) => ({
      tasks: Object.fromEntries(
        Object.entries(state.tasks).filter(
          ([key]) => !key.startsWith(workflowId)
        )
      )
    }));
  },
  /**
   * Clear the planning updates for a workflow.
   */
  clearPlanningUpdates: (workflowId: string) => {
    set((state) => ({
      planningUpdates: Object.fromEntries(
        Object.entries(state.planningUpdates).filter(
          ([key]) => !key.startsWith(workflowId)
        )
      )
    }));
  },
  /**
   * Clear the chunks for a workflow.
   */
  clearChunks: (workflowId: string) => {
    set((state) => ({
      chunks: Object.fromEntries(
        Object.entries(state.chunks).filter(
          ([key]) => !key.startsWith(workflowId)
        )
      )
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
    nodeId: string,
    result: any,
    append?: boolean
  ) => {
    const key = hashKey(workflowId, nodeId);
    set((state) => {
      const currentResult = state.results[key];
      if (currentResult === undefined || !append) {
        return { results: { ...state.results, [key]: result } };
      } else {
        if (Array.isArray(currentResult)) {
          return {
            results: {
              ...state.results,
              [key]: [...currentResult, result]
            }
          };
        } else {
          return {
            results: {
              ...state.results,
              [key]: [currentResult, result]
            }
          };
        }
      }
    });
  },

  /**
   * Get the result for a node.
   *
   * @param workflowId The id of the workflow.
   * @param nodeId The id of the node.
   * @returns The result for the node.
   */
  getResult: (workflowId: string, nodeId: string) => {
    const results = get().results;
    const key = hashKey(workflowId, nodeId);
    return results[key];
  },

  /**
   * Get the output result for a node (from OutputUpdate messages).
   *
   * @param workflowId The id of the workflow.
   * @param nodeId The id of the node.
   * @returns The output result for the node.
   */
  getOutputResult: (workflowId: string, nodeId: string) => {
    const outputResults = get().outputResults;
    const key = hashKey(workflowId, nodeId);
    const result = outputResults[key];
    return result;
  },

  /**
   * Set the output result for a node (from OutputUpdate messages).
   * The result is stored in the outputResults map.
   *
   * @param workflowId The id of the workflow.
   * @param nodeId The id of the node.
   * @param result The result to set.
   * @param append Whether to append to existing result.
   */
  setOutputResult: (
    workflowId: string,
    nodeId: string,
    result: any,
    append?: boolean
  ) => {
    const key = hashKey(workflowId, nodeId);
    set((state) => {
      const currentResult = state.outputResults[key];
      if (currentResult === undefined || !append) {
        return {
          outputResults: { ...state.outputResults, [key]: result }
        };
      } else {
        if (Array.isArray(currentResult)) {
          return {
            outputResults: {
              ...state.outputResults,
              [key]: [...currentResult, result]
            }
          };
        } else {
          return {
            outputResults: {
              ...state.outputResults,
              [key]: [currentResult, result]
            }
          };
        }
      }
    });
  },

  /**
   * Set the progress for a node.
   *
   * @param workflowId The id of the workflow.
   * @param nodeId The id of the node.
   * @param progress The progress to set.
   * @param total The total to set.
   * @param chunk The chunk in a streaming prediction.
   * @returns The progress and total for the node.
   */
  setProgress: (
    workflowId: string,
    nodeId: string,
    progress: number,
    total: number,
    chunk?: string
  ) => {
    const key = hashKey(workflowId, nodeId);
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
   * @param nodeId The id of the node.
   *
   * @returns The progress and total for the node.
   */
  getProgress: (workflowId: string, nodeId: string) => {
    const progress = get().progress;
    const key = hashKey(workflowId, nodeId);
    return progress[key];
  },
  addChunk: (workflowId: string, nodeId: string, chunk: string) => {
    const key = hashKey(workflowId, nodeId);
    set((state) => {
      const currentChunk = state.chunks[key] || "";
      return { chunks: { ...state.chunks, [key]: currentChunk + chunk } };
    });
  },
  getChunk: (workflowId: string, nodeId: string) => {
    const key = hashKey(workflowId, nodeId);
    return get().chunks[key];
  }
}));

export default useResultsStore;
