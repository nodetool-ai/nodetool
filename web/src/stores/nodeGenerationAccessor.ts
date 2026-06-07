import useResultsStore from "./ResultsStore";
import { useWorkflowAssetStore } from "./WorkflowAssetStore";
import {
  assetToGeneration,
  mergeGenerations,
  getCurrentOutput,
  type Generation
} from "../utils/nodeGenerations";

/**
 * Sync accessor returning a node's full generation timeline: durable workflow
 * assets merged with the in-memory live buffer. Used on the run path where a
 * reactive hook is unavailable.
 */
export const getNodeGenerations = (
  workflowId: string,
  nodeId: string
): Generation[] => {
  const assets = useWorkflowAssetStore
    .getState()
    .getWorkflowAssets(workflowId)
    .filter((a) => a.node_id === nodeId);
  const persisted = assets.map(assetToGeneration);
  const live = useResultsStore
    .getState()
    .getLiveGenerations(workflowId, nodeId);
  return mergeGenerations(persisted, live);
};

/** Current output for a node, honoring its persisted selection. */
export const getNodeCurrentOutput = (
  workflowId: string,
  nodeId: string,
  selectedId?: string,
  handle?: string
): unknown =>
  getCurrentOutput(getNodeGenerations(workflowId, nodeId), selectedId, handle);
