import { create } from "zustand";
import { useNodeStore } from "./NodeStore";

type ResultsStore = {
  results: Record<string, any>;
  progress: Record<string, { progress: number; total: number }>;
  deleteResult: (workflowId: string, nodeId: string) => void;
  clearResults: (workflowId: string) => void;
  clearProgress: (workflowId: string) => void;
  setResult: (workflowId: string, nodeId: string, result: any) => void;
  getResult: (workflowId: string, nodeId: string) => any;
  setProgress: (
    workflowId: string,
    nodeId: string,
    progress: number,
    total: number
  ) => void;
  getProgress: (
    workflowId: string,
    nodeId: string
  ) => { progress: number; total: number };
};

export const hashKey = (workflowId: string, nodeId: string) =>
  `${workflowId}:${nodeId}`;

const useResultsStore = create<ResultsStore>((set, get) => ({
  results: {},
  progress: {},
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
   * The dirty flag of the node is set to false.
   *
   * @param workflowId The id of the workflow.
   * @param nodeId The id of the node.
   * @param result The result to set.
   */
  setResult: (workflowId: string, nodeId: string, result: any) => {
    const findNode = useNodeStore.getState().findNode;
    const nodeData = findNode(nodeId)?.data;
    const updateNode = useNodeStore.getState().updateNodeData;
    if (nodeData) {
      updateNode(nodeId, { ...nodeData, dirty: false });
    }
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
   *
   * @returns The progress and total for the node.
   */
  setProgress: (
    workflowId: string,
    nodeId: string,
    progress: number,
    total: number
  ) => {
    const key = hashKey(workflowId, nodeId);
    set({ progress: { ...get().progress, [key]: { progress, total } } });
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
  }
}));

export default useResultsStore;
