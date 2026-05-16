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
import { useNodes } from "../../contexts/NodeContext";
import useResultsStore from "../../stores/ResultsStore";

/**
 * Walk envelopes / accumulated arrays down to the bare value:
 *   - `setOutputResult(..., append=true)` accumulates per-run values as an
 *     array — take the latest entry, recursively (a streaming node could
 *     itself emit `{ output: ... }` envelopes).
 *   - `{ [handle]: x }` or `{ output: x }` envelopes from `node_complete`
 *     are peeled by name.
 */
const unwrapOutput = (value: unknown, handle?: string | null): unknown => {
  if (Array.isArray(value)) {
    return value.length > 0 ? unwrapOutput(value[value.length - 1], handle) : undefined;
  }
  if (!value || typeof value !== "object") return value;
  const v = value as Record<string, unknown>;
  if (handle && handle in v) return v[handle];
  if ("output" in v) return v.output;
  return value;
};

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
  const upstreamEdge = useNodes(
    (state) =>
      state.edges.find(
        (e) => e.target === nodeId && (e.targetHandle ?? "") === inputName
      ),
    shallow
  );

  const upstreamValue = useResultsStore((state) => {
    const src = upstreamEdge?.source;
    if (!src) return undefined;
    return unwrapOutput(
      readAnyStoreValue(state, workflowId, src),
      upstreamEdge?.sourceHandle
    );
  }, shallow);

  return upstreamEdge ? upstreamValue : constantFallback;
};
