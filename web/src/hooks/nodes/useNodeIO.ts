/**
 * useNodeIO — hooks for resolving node input/output values.
 *
 * Bespoke node bodies (BlurBody, CropBody, …) need to display either
 * the upstream value feeding one of their inputs or the node's own latest
 * output. The runtime stores results in three places:
 *
 *   - `outputResults` — bare per-output value (streaming / output_update)
 *   - `results`       — `node_complete` envelope, typically `{ output: x }`
 *   - `previews`      — preview snapshots
 *
 * These hooks query all three in the order PreviewNode uses, unwrap the
 * envelope, and return a single bare value so callers don't reimplement
 * the resolution chain.
 */
import { shallow } from "zustand/shallow";
import { useMemo } from "react";
import { useNodes } from "../../contexts/NodeContext";
import useResultsStore from "../../stores/ResultsStore";
import { unwrapOutput } from "../../utils/imageRef";
import { resolveExternalEdgeValue } from "../../utils/edgeValue";
import type { NodeStoreState } from "../../stores/NodeStore";

const readAnyStoreValue = (
  state: ReturnType<typeof useResultsStore.getState>,
  workflowId: string,
  nodeId: string
): unknown =>
  state.getOutputResult(workflowId, nodeId) ??
  state.getResult(workflowId, nodeId) ??
  state.getPreview(workflowId, nodeId);

/**
 * Resolve a node's own latest output value, bare (envelope unwrapped).
 * Returns `undefined` when no value has been produced yet.
 */
export const useNodeOutput = (
  workflowId: string,
  nodeId: string
): unknown => {
  return useResultsStore(
    (state) => unwrapOutput(readAnyStoreValue(state, workflowId, nodeId)),
    shallow
  );
};

/**
 * Resolve the current value feeding a node's named input:
 *   - if an edge targets the input, return the upstream node's output value
 *     (unwrapped using the edge's `sourceHandle`);
 *   - otherwise return `constantFallback` (typically `data.properties[name]`).
 *
 * Returns `undefined` when neither a wired source nor a constant is available.
 */
export const useUpstreamValue = (
  workflowId: string,
  nodeId: string,
  inputName: string,
  constantFallback?: unknown
): unknown => {
  const { upstreamEdge, findNode } = useNodes(
    useMemo(
      () => (state: NodeStoreState) => ({
        upstreamEdge: state.edges.find(
          (e) => e.target === nodeId && (e.targetHandle ?? "") === inputName
        ),
        findNode: state.findNode
      }),
      [nodeId, inputName]
    ),
    shallow
  );

  return useResultsStore((state) => {
    if (!upstreamEdge) {
      return constantFallback;
    }

    const storeValue = unwrapOutput(
      readAnyStoreValue(state, workflowId, upstreamEdge.source),
      upstreamEdge.sourceHandle
    );
    if (storeValue !== undefined) {
      return storeValue;
    }

    const resolved = resolveExternalEdgeValue(
      upstreamEdge,
      workflowId,
      (wf, src) => readAnyStoreValue(state, wf, src),
      findNode
    );
    return resolved.hasValue ? resolved.value : undefined;
  }, shallow);
};
