import { create } from "zustand";
import { Task } from "./ApiTypes";

type ResultsStore = {
  results: Record<string, any>;
  progress: Record<string, { progress: number; total: number; chunk?: string }>;
  chunks: Record<string, string>;
  tasks: Record<string, Task>;
  deleteResult: (workflowId: string, nodeId: string) => void;
  clearResults: (workflowId: string) => void;
  clearProgress: (workflowId: string) => void;
  setResult: (workflowId: string, nodeId: string, result: any) => void;
  getResult: (workflowId: string, nodeId: string) => any;
  setTask: (workflowId: string, nodeId: string, task: Task) => void;
  getTask: (workflowId: string, nodeId: string) => Task | undefined;
  addChunk: (workflowId: string, nodeId: string, chunk: string) => void;
  getChunk: (workflowId: string, nodeId: string) => string | undefined;
  setProgress: (
    workflowId: string,
    nodeId: string,
    progress: number,
    total: number
  ) => void;
  getProgress: (
    workflowId: string,
    nodeId: string
  ) => { progress: number; total: number } | undefined;
};

export const hashKey = (workflowId: string, nodeId: string) =>
  `${workflowId}:${nodeId}`;

const useResultsStore = create<ResultsStore>((set, get) => ({
  results: {},
  progress: {},
  chunks: {},
  tasks: {},
  /**
   * Set the task for a node.
   * The task is stored in the tasks map.
   */
  setTask: (workflowId: string, nodeId: string, task: Task) => {
    set({ tasks: { ...get().tasks, [hashKey(workflowId, nodeId)]: task } });
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
    const results = get().results;
    const key = hashKey(workflowId, nodeId);
    delete results[key];
    set({ results });
  },
  /**
   * Clear the results for a workflow.
   * The results are removed from the results map.
   */
  clearResults: (workflowId: string) => {
    const results = get().results;
    for (const key in results) {
      if (key.startsWith(workflowId)) {
        delete results[key];
      }
    }
    set({ results });
  },
  /**
   * Clear the progress for a workflow.
   */
  clearProgress: (workflowId: string) => {
    const progress = get().progress;
    for (const key in progress) {
      if (key.startsWith(workflowId)) {
        delete progress[key];
      }
    }
    set({ progress });
  },
  /**
   * Set the result for a node.
   * The result is stored in the results map.
   *
   * @param workflowId The id of the workflow.
   * @param nodeId The id of the node.
   * @param result The result to set.
   */
  setResult: (workflowId: string, nodeId: string, result: any) => {
    const key = hashKey(workflowId, nodeId);
    set({ results: { ...get().results, [key]: result } });
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
    const currentChunk = get().progress[key]?.chunk || "";
    set({
      progress: {
        ...get().progress,
        [key]: { progress, total, chunk: currentChunk + (chunk || "") }
      }
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
    const currentChunk = get().chunks[key] || "";
    set({ chunks: { ...get().chunks, [key]: currentChunk + chunk } });
  },
  getChunk: (workflowId: string, nodeId: string) => {
    const key = hashKey(workflowId, nodeId);
    return get().chunks[key];
  }
}));

export default useResultsStore;
