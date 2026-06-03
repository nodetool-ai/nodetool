/**
 * useNodeIO — hooks for resolving node input/output values.
 *
 * Bespoke node bodies (BlurBody, CropBody, …) need to display either
 * the upstream value feeding one of their inputs or the node's own latest
 * output. The runtime stores results in two places:
 *
 *   - `outputResults` — bare per-output value (streaming / output_update)
 *   - `results`       — `node_complete` envelope, typically `{ output: x }`
 *
 * These hooks query both, unwrap the envelope, and return a single bare
 * value so callers don't reimplement the resolution chain.
 */
import { shallow } from "zustand/shallow";
import { useShallow } from "zustand/react/shallow";
import { useMemo } from "react";
import { useNodes } from "../../contexts/NodeContext";
import useResultsStore from "../../stores/ResultsStore";
import { useNodeResultValue } from "./useNodeExecState";
import { unwrapOutput } from "../../utils/imageRef";
import { resolveExternalEdgeValue } from "../../utils/edgeValue";
import type { NodeStoreState } from "../../stores/NodeStore";
import type { Edge } from "@xyflow/react";

const readAnyStoreValue = (
  state: ReturnType<typeof useResultsStore.getState>,
  workflowId: string,
  nodeId: string
): unknown =>
  state.getOutputResult(workflowId, nodeId) ??
  state.getResult(workflowId, nodeId);

/**
 * Resolve a node's own latest output value, bare (envelope unwrapped).
 * Returns `undefined` when no value has been produced yet.
 */
export const useNodeOutput = (
  workflowId: string,
  nodeId: string
): unknown => {
  const raw = useNodeResultValue(workflowId, nodeId);
  return unwrapOutput(raw);
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

  // Single-node read for the upstream source — migrated to accessor hook.
  const upstreamRaw = useNodeResultValue(workflowId, upstreamEdge?.source ?? "");

  // resolveExternalEdgeValue is a multi-source fallback; keep it inside the
  // store selector so it reads atomically from the store snapshot.
  const fallbackValue = useResultsStore(useShallow((state) => {
    if (!upstreamEdge) return undefined;
    const resolved = resolveExternalEdgeValue(
      upstreamEdge,
      workflowId,
      (wf, src) => readAnyStoreValue(state, wf, src),
      findNode
    );
    return resolved.hasValue ? resolved.value : undefined;
  }));

  if (!upstreamEdge) {
    return constantFallback;
  }
  const storeValue = unwrapOutput(upstreamRaw, upstreamEdge.sourceHandle);
  if (storeValue !== undefined) {
    return storeValue;
  }
  return fallbackValue;
};

/**
 * Resolve the values feeding several named inputs at once — the array-valued
 * sibling of `useUpstreamValue` for nodes with a variable number of inputs
 * (e.g. the Compositor's dynamic `image_N` layers). Each input is resolved
 * with identical semantics: a wired edge's upstream output (all three stores,
 * unwrapped by `sourceHandle`, with the literal-source fallback), otherwise
 * the per-input constant from `constants`.
 *
 * Returns a record keyed by input name. Single subscription per store,
 * shallow-compared, so the hook count stays constant regardless of how many
 * inputs are passed.
 */
export const useUpstreamValues = (
  workflowId: string,
  nodeId: string,
  inputNames: string[],
  constants?: Record<string, unknown>
): Record<string, unknown> => {
  const edges = useNodes(
    (state: NodeStoreState) => state.edges.filter((e) => e.target === nodeId),
    shallow
  );
  const findNode = useNodes((state: NodeStoreState) => state.findNode);

  const edgeByHandle = useMemo(() => {
    const map = new Map<string, Edge>();
    for (const e of edges) map.set(e.targetHandle ?? "", e);
    return map;
  }, [edges]);

  return useResultsStore(useShallow((state) => {
    const out: Record<string, unknown> = {};
    for (const name of inputNames) {
      const edge = edgeByHandle.get(name);
      if (!edge) {
        out[name] = constants?.[name];
        continue;
      }
      const storeValue = unwrapOutput(
        readAnyStoreValue(state, workflowId, edge.source),
        edge.sourceHandle
      );
      if (storeValue !== undefined) {
        out[name] = storeValue;
        continue;
      }
      const resolved = resolveExternalEdgeValue(
        edge,
        workflowId,
        (wf, src) => readAnyStoreValue(state, wf, src),
        findNode
      );
      out[name] = resolved.hasValue ? resolved.value : undefined;
    }
    return out;
  }));
};
