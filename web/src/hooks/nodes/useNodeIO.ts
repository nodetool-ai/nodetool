/**
 * useNodeIO — hooks for resolving node input/output values.
 *
 * Bespoke node bodies (BlurBody, CropBody, …) need to display either the
 * upstream value feeding one of their inputs or the node's own latest output.
 * Both resolve from a node's generation timeline: durable workflow assets
 * merged with the in-memory live buffer, honoring the node's persisted
 * selection (`getCurrentGeneration` → `outputOf`).
 *
 * These hooks resolve that timeline and unwrap by the edge's `sourceHandle`,
 * so callers don't reimplement the resolution chain.
 */
import { shallow } from "zustand/shallow";
import { useShallow } from "zustand/react/shallow";
import { useCallback, useMemo } from "react";
import { useNodes } from "../../contexts/NodeContext";
import useResultsStore from "../../stores/ResultsStore";
import { useWorkflowAssetStore } from "../../stores/WorkflowAssetStore";
import { useNodeResultValue } from "./useNodeExecState";
import { resolveExternalEdgeValue } from "../../utils/edgeValue";
import {
  assetToGeneration,
  getCurrentGeneration,
  mergeGenerations,
  outputOf,
  type Generation
} from "../../utils/nodeGenerations";
import type { Asset } from "../../stores/ApiTypes";
import type { NodeData } from "../../stores/NodeData";
import type { NodeStoreState } from "../../stores/NodeStore";
import type { Edge, Node } from "@xyflow/react";

const EMPTY_ASSETS: Asset[] = [];

/**
 * Subscribe to the generation backings for a workflow and return a resolver for
 * any node's current generation. One subscription per backing store covers an
 * arbitrary number of source nodes, so hooks resolving a variable number of
 * inputs (e.g. `useUpstreamValues`) keep a constant hook count.
 */
const useCurrentGenerationResolver = (
  workflowId: string
): ((nodeId: string, node?: Node<NodeData>) => Generation | undefined) => {
  const assets = useWorkflowAssetStore(
    useShallow((s) => s.assetsByWorkflow[workflowId] ?? EMPTY_ASSETS)
  );
  const liveGenerations = useResultsStore(useShallow((s) => s.liveGenerations));
  return useCallback(
    (nodeId, node) => {
      const persisted = assets
        .filter((a) => a.node_id === nodeId)
        .map(assetToGeneration);
      const live = liveGenerations[`${workflowId}:${nodeId}`] ?? [];
      const generations = mergeGenerations(persisted, live);
      const selectedId = node?.data?.selected_generation;
      return getCurrentGeneration(generations, selectedId);
    },
    [assets, liveGenerations, workflowId]
  );
};

/**
 * Resolve a node's own latest output value, bare. Returns `undefined` when no
 * generation has been produced yet.
 */
export const useNodeOutput = (
  workflowId: string,
  nodeId: string
): unknown => useNodeResultValue(workflowId, nodeId);

/**
 * Resolve the current value feeding a node's named input:
 *   - if an edge targets the input, return the upstream node's current
 *     generation output (unwrapped using the edge's `sourceHandle`);
 *   - otherwise return the upstream literal-source node's property
 *     (constant/input nodes wired but not yet run);
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

  const resolveCurrent = useCurrentGenerationResolver(workflowId);

  if (!upstreamEdge) {
    return constantFallback;
  }

  const sourceNode = findNode(upstreamEdge.source);
  const current = resolveCurrent(upstreamEdge.source, sourceNode);
  const storeValue = current
    ? outputOf(current, upstreamEdge.sourceHandle ?? undefined)
    : undefined;
  if (storeValue !== undefined) {
    return storeValue;
  }

  // No generation yet — fall back to a wired literal-source node's property.
  const resolved = resolveExternalEdgeValue(
    upstreamEdge,
    workflowId,
    () => undefined,
    findNode
  );
  return resolved.hasValue ? resolved.value : constantFallback;
};

/**
 * Resolve the values feeding several named inputs at once — the array-valued
 * sibling of `useUpstreamValue` for nodes with a variable number of inputs
 * (e.g. the Compositor's dynamic `image_N` layers). Each input is resolved with
 * identical semantics: a wired edge's upstream current-generation output
 * (unwrapped by `sourceHandle`, with the literal-source fallback), otherwise the
 * per-input constant from `constants`.
 *
 * Returns a record keyed by input name. Single subscription per backing store,
 * so the hook count stays constant regardless of how many inputs are passed.
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

  const resolveCurrent = useCurrentGenerationResolver(workflowId);

  return useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const name of inputNames) {
      const edge = edgeByHandle.get(name);
      if (!edge) {
        out[name] = constants?.[name];
        continue;
      }
      const sourceNode = findNode(edge.source);
      const current = resolveCurrent(edge.source, sourceNode);
      const storeValue = current
        ? outputOf(current, edge.sourceHandle ?? undefined)
        : undefined;
      if (storeValue !== undefined) {
        out[name] = storeValue;
        continue;
      }
      const resolved = resolveExternalEdgeValue(
        edge,
        workflowId,
        () => undefined,
        findNode
      );
      out[name] = resolved.hasValue ? resolved.value : constants?.[name];
    }
    return out;
  }, [
    inputNames,
    edgeByHandle,
    findNode,
    resolveCurrent,
    workflowId,
    constants
  ]);
};
