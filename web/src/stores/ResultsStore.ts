/**
 * ResultsStore manages workflow execution results and streaming data.
 *
 * Keys are scoped by job: `${workflowId}:${jobId}:${id}` where `id` is a node
 * id (or an edge id for the `edges` map). This lets concurrent same-workflow
 * runs keep independent output/progress/edges while the canvas focuses one run
 * at a time (see WorkflowRunsStore). For a single run the focused job is that
 * run, so behavior is unchanged.
 */

import { create } from "zustand";
import { PlanningUpdate, ProviderCost, Task, ToolCallUpdate } from "./ApiTypes";
import { nodeKey, edgeKey, type NodeKey, type EdgeKey } from "./nodeKey";
import type { Generation } from "../utils/nodeGenerations";

/** Rolling-window size for appended audio-chunk stream buffers (~20s of
 * audio at the synth nodes' 512-frame / 24 kHz chunks). */
const MAX_AUDIO_STREAM_CHUNKS = 1024;

const isAudioStreamChunk = (v: unknown): boolean => {
  if (!v || typeof v !== "object") {
    return false;
  }
  const c = v as Record<string, unknown>;
  return c.type === "chunk" && c.content_type === "audio";
};

type ResultsStore = {
  outputResults: Record<NodeKey, unknown>;
  liveGenerations: Record<string, Generation[]>;
  providerCosts: Record<NodeKey, ProviderCost>;
  resultsVersion: number;
  progress: Record<NodeKey, { progress: number; total: number; chunk?: string }>;
  edges: Record<EdgeKey, { status: string; counter?: number }>;
  chunks: Record<NodeKey, string>;
  tasks: Record<NodeKey, Task>;
  toolCalls: Record<NodeKey, ToolCallUpdate>;
  toolResults: Record<NodeKey, unknown[]>;
  planningUpdates: Record<NodeKey, PlanningUpdate>;
  clearResults: (workflowId: string, nodeIds?: Set<string>) => void;
  clearOutputResults: (workflowId: string, nodeIds?: Set<string>) => void;
  clearProgress: (workflowId: string, nodeIds?: Set<string>) => void;
  clearToolCalls: (workflowId: string, nodeIds?: Set<string>) => void;
  clearTasks: (workflowId: string, nodeIds?: Set<string>) => void;
  clearChunks: (workflowId: string, nodeIds?: Set<string>) => void;
  clearPlanningUpdates: (workflowId: string, nodeIds?: Set<string>) => void;
  clearEdges: (workflowId: string, edgeIds?: Set<string>) => void;
  clearJobRunVisuals: (workflowId: string, jobId: string) => void;
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
  upsertLiveGeneration: (
    workflowId: string,
    nodeId: string,
    jobId: string,
    patch: Partial<Generation>
  ) => void;
  getLiveGenerations: (workflowId: string, nodeId: string) => Generation[];
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
  appendOutputResults: (
    workflowId: string,
    jobId: string,
    nodeId: string,
    results: unknown[]
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
  appendToolResult: (
    workflowId: string,
    jobId: string,
    nodeId: string,
    result: unknown
  ) => void;
  getToolResults: (
    workflowId: string,
    jobId: string,
    nodeId: string
  ) => unknown[];
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

/** @deprecated kept as a re-export of `nodeKey` for backwards compatibility. */
export const hashKey = nodeKey;

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
const filterRecord = <K extends string, T>(
  record: Record<K, T>,
  workflowId: string,
  specificIds?: Set<string>
): Record<K, T> => {
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
  const newRecord = {} as Record<K, T>;
  for (const key in record) {
    if (!key.startsWith(prefix)) {
      newRecord[key] = record[key];
    }
  }
  return newRecord;
};

const useResultsStore = create<ResultsStore>((set, get) => ({
  outputResults: {},
  liveGenerations: {},
  providerCosts: {},
  resultsVersion: 0,
  progress: {},
  chunks: {},
  tasks: {},
  toolCalls: {},
  toolResults: {},
  edges: {},
  planningUpdates: {},
  clearEdges: (workflowId: string, edgeIds?: Set<string>) => {
    set((state) => ({
      edges: filterRecord(state.edges, workflowId, edgeIds)
    }));
  },
  /**
   * Drop one run's transient visuals — edge animations and node progress.
   * Job-scoped (keys are `${workflowId}:${jobId}:…`), so concurrent sibling
   * runs keep theirs. Outputs/generations are left intact so the cancelled
   * run can still be focused and inspected.
   */
  clearJobRunVisuals: (workflowId: string, jobId: string) => {
    const prefix = `${workflowId}:${jobId}:`;
    const dropJobKeys = <K extends string, T>(
      record: Record<K, T>
    ): Record<K, T> => {
      const next = { ...record };
      for (const key in next) {
        if (key.startsWith(prefix)) {
          delete next[key];
        }
      }
      return next;
    };
    set((state) => ({
      edges: dropJobKeys(state.edges),
      progress: dropJobKeys(state.progress),
      resultsVersion: state.resultsVersion + 1
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
        [nodeKey(workflowId, jobId, nodeId)]: planningUpdate
      }
    }));
  },
  /**
   * Get the planning update for a node.
   * The planning update is stored in the planningUpdates map.
   */
  getPlanningUpdate: (workflowId: string, jobId: string, nodeId: string) => {
    return get().planningUpdates[nodeKey(workflowId, jobId, nodeId)];
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
    const key = edgeKey(workflowId, jobId, edgeId);
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
    return get().edges[edgeKey(workflowId, jobId, edgeId)];
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
        [nodeKey(workflowId, jobId, nodeId)]: toolCall
      }
    }));
  },
  /**
   * Get the tool call for a node.
   * The tool call is stored in the toolCalls map.
   */
  getToolCall: (workflowId: string, jobId: string, nodeId: string) => {
    return get().toolCalls[nodeKey(workflowId, jobId, nodeId)];
  },
  /**
   * Append a tool result for a node.
   * Tool results are artifacts of an agent's run (not its output value), so
   * they accumulate in the toolResults map keyed per (workflow, job, node).
   */
  appendToolResult: (
    workflowId: string,
    jobId: string,
    nodeId: string,
    result: unknown
  ) => {
    const key = nodeKey(workflowId, jobId, nodeId);
    set((state) => ({
      toolResults: {
        ...state.toolResults,
        [key]: [...(state.toolResults[key] ?? []), result]
      }
    }));
  },
  /**
   * Get the accumulated tool results for a node.
   */
  getToolResults: (workflowId: string, jobId: string, nodeId: string) => {
    return get().toolResults[nodeKey(workflowId, jobId, nodeId)] ?? [];
  },
  /**
   * Set the task for a node.
   * The task is stored in the tasks map.
   */
  setTask: (workflowId: string, jobId: string, nodeId: string, task: Task) => {
    set((state) => ({
      tasks: { ...state.tasks, [nodeKey(workflowId, jobId, nodeId)]: task }
    }));
  },
  /**
   * Get the task for a node.
   * The task is stored in the tasks map.
   */
  getTask: (workflowId: string, jobId: string, nodeId: string) => {
    return get().tasks[nodeKey(workflowId, jobId, nodeId)];
  },
  /**
   * Clear all per-node results for a workflow (or for specific nodes of it):
   * provider costs, live generations, tool results, output results, progress,
   * chunks, tasks, tool calls and planning updates. Edge status is keyed by
   * edge id, not node id, so it is cleared separately via `clearEdges`.
   */
  clearResults: (workflowId: string, nodeIds?: Set<string>) => {
    set((state) => ({
      providerCosts: filterRecord(state.providerCosts, workflowId, nodeIds),
      liveGenerations: filterRecord(state.liveGenerations, workflowId, nodeIds),
      toolResults: filterRecord(state.toolResults, workflowId, nodeIds),
      outputResults: filterRecord(state.outputResults, workflowId, nodeIds),
      progress: filterRecord(state.progress, workflowId, nodeIds),
      chunks: filterRecord(state.chunks, workflowId, nodeIds),
      tasks: filterRecord(state.tasks, workflowId, nodeIds),
      toolCalls: filterRecord(state.toolCalls, workflowId, nodeIds),
      planningUpdates: filterRecord(state.planningUpdates, workflowId, nodeIds),
      resultsVersion: state.resultsVersion + 1
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
   * Upsert a live generation for a node, keyed by `${workflowId}:${nodeId}`.
   * A generation is identified within the node by its `jobId`: the first patch
   * for a job creates a running generation, later patches merge into it.
   */
  upsertLiveGeneration: (
    workflowId: string,
    nodeId: string,
    jobId: string,
    patch: Partial<Generation>
  ) => {
    const key = `${workflowId}:${nodeId}`;
    set((state) => {
      const list = state.liveGenerations[key] ?? [];
      const idx = list.findIndex((g) => g.jobId === jobId);
      const base: Generation =
        idx >= 0
          ? list[idx]
          : {
              id: jobId,
              jobId,
              createdAt: patch.createdAt ?? 0,
              outputs: {},
              status: "running"
            };
      const next: Generation = { ...base, ...patch, id: base.id, jobId };
      const updated =
        idx >= 0
          ? list.map((g, i) => (i === idx ? next : g))
          : [...list, next];
      return {
        liveGenerations: { ...state.liveGenerations, [key]: updated }
      };
    });
  },

  /**
   * Get the live generations for a node, keyed by `${workflowId}:${nodeId}`.
   */
  getLiveGenerations: (workflowId: string, nodeId: string) =>
    get().liveGenerations[`${workflowId}:${nodeId}`] ?? [],

  setProviderCost: (
    workflowId: string,
    jobId: string,
    nodeId: string,
    cost: ProviderCost
  ) => {
    set((state) => ({
      providerCosts: {
        ...state.providerCosts,
        [nodeKey(workflowId, jobId, nodeId)]: cost
      }
    }));
  },

  getProviderCost: (workflowId: string, jobId: string, nodeId: string) => {
    return get().providerCosts[nodeKey(workflowId, jobId, nodeId)];
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
    const key = nodeKey(workflowId, jobId, nodeId);
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
    const key = nodeKey(workflowId, jobId, nodeId);
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
          let appended = [...currentResult, result];
          // Realtime audio streams are infinite; without a cap the buffer
          // (and the per-chunk array copy above) grows unboundedly and the
          // resulting GC churn turns into audible scheduling jank. Keep a
          // rolling window — playback tracks chunks by identity, so head
          // trimming is safe. Text/other streams are left untouched.
          if (
            appended.length > MAX_AUDIO_STREAM_CHUNKS &&
            isAudioStreamChunk(result)
          ) {
            appended = appended.slice(appended.length - MAX_AUDIO_STREAM_CHUNKS);
          }
          return {
            outputResults: {
              ...state.outputResults,
              [key]: appended
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
   * Append a batch of streamed results to a node's buffer in ONE store set.
   *
   * Realtime audio streams arrive at ~50 chunks/s per node; appending each
   * chunk via setOutputResult would do one array copy + one subscriber
   * notification per chunk. Callers coalesce chunks (workflowUpdates flushes
   * on a timer) and land them here in a single copy/notify.
   */
  appendOutputResults: (
    workflowId: string,
    jobId: string,
    nodeId: string,
    results: unknown[]
  ) => {
    if (results.length === 0) return;
    const key = nodeKey(workflowId, jobId, nodeId);
    set((state) => {
      const current = state.outputResults[key];
      let appended =
        current === undefined
          ? [...results]
          : Array.isArray(current)
            ? [...current, ...results]
            : [current, ...results];
      if (
        appended.length > MAX_AUDIO_STREAM_CHUNKS &&
        isAudioStreamChunk(results[results.length - 1])
      ) {
        appended = appended.slice(appended.length - MAX_AUDIO_STREAM_CHUNKS);
      }
      return {
        outputResults: { ...state.outputResults, [key]: appended },
        resultsVersion: state.resultsVersion + 1
      };
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
    const key = nodeKey(workflowId, jobId, nodeId);
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
    const key = nodeKey(workflowId, jobId, nodeId);
    return progress[key];
  },
  addChunk: (
    workflowId: string,
    jobId: string,
    nodeId: string,
    chunk: string
  ) => {
    const key = nodeKey(workflowId, jobId, nodeId);
    set((state) => {
      const currentChunk = state.chunks[key] || "";
      return { chunks: { ...state.chunks, [key]: currentChunk + chunk } };
    });
  },
  getChunk: (workflowId: string, jobId: string, nodeId: string) => {
    const key = nodeKey(workflowId, jobId, nodeId);
    return get().chunks[key];
  }
}));

export default useResultsStore;
