import { create } from "zustand";
import { useNodeStore } from "./NodeStore";

type ResultsStore = {
  results: Record<string, any>;
  deleteResult: (workflowId: string, nodeId: string) => void;
  setResult: (workflowId: string, nodeId: string, result: any) => void;
  getResult: (workflowId: string, nodeId: string) => any;
};

const hashKey = (workflowId: string, nodeId: string) =>
  `${workflowId}:${nodeId}`;

const useResultsStore = create<ResultsStore>((set, get) => ({
  results: {},
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
  }
}));

export default useResultsStore;
