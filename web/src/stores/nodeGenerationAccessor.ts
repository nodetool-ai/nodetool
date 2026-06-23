import useResultsStore from "./ResultsStore";
import { useWorkflowAssetStore } from "./WorkflowAssetStore";
import {
  assetToGeneration,
  mergeGenerations,
  selectedOutputValues,
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

/**
 * The selected (pick-ordered, completed, num_images-flattened) value list for a
 * source node's edge handle from its multi-select set, read from the merged
 * timeline. Returns undefined when fewer than 2 generations are selected
 * (single-selection behavior is unchanged) or when nothing in the set qualifies
 * (selectedOutputValues yields []). The partial-run paths feed this list as the
 * `input_list` of a synthetic ForEach replay node so the downstream receives the
 * set as a STREAM of N iteration-correlated emissions — identical to a live
 * generation of those N items. A single focused generation (or no selection)
 * resolves through the normal single-value path unchanged.
 */
export const getNodeSelectedOutputs = (
  workflowId: string,
  sourceId: string,
  handle: string | null | undefined,
  selectedGenerations: string[] | undefined
): unknown[] | undefined => {
  if (!selectedGenerations || selectedGenerations.length < 2) {
    return undefined;
  }
  const values = selectedOutputValues(
    getNodeGenerations(workflowId, sourceId),
    selectedGenerations,
    handle ?? undefined
  );
  return values.length > 0 ? values : undefined;
};
