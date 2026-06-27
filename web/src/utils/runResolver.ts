import { Edge, Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";
import { NodeMetadata } from "../stores/ApiTypes";
import { resolveExternalEdgeValue } from "./edgeValue";
import { createNodeHasher, type NodeKind } from "./nodeHash";
import {
  resolve,
  type ResolveContext,
  type ResolveDecision
} from "./runResolve";
import {
  getCurrentGeneration,
  newestCompletedGeneration,
  newestCompletedGenerationForSignature,
  outputOf,
  selectedOutputValues,
  type Generation
} from "./nodeGenerations";

type GetMetadata = (_nodeType: string) => NodeMetadata | undefined;
type GetGenerations = (_workflowId: string, _nodeId: string) => Generation[];

export interface RunResolverParams {
  nodes: Node<NodeData>[];
  edges: Edge[];
  workflowId: string;
  getMetadata: GetMetadata;
  /** Merged generation history (durable assets + live buffer) for a node. */
  getGenerations: GetGenerations;
  /** Injected clock (ms) for TTL freshness. App passes `Date.now()`. */
  now: number;
}

/**
 * The shared external-edge resolution surface used by every partial-run entry
 * point ("Run Node", "Run from here", "Run selected"). One resolver is built
 * over the full graph; all call sites then classify a source, decide its
 * reuse/replay/run/block fate, and extract the value it contributes
 * identically — built on a single hasher + generation cache so signatures and
 * decisions stay consistent across calls.
 */
export interface RunResolver {
  /**
   * Classify a source: constant | generative | computed (see nodeHash). Used to
   * tell a generative "block" (record it for the user) apart from a computed
   * "block" (recurse to the blocking generative).
   */
  classify: (_sourceId: string) => NodeKind;
  /**
   * Reuse / replay / run / block decision for a source (spec §5). Wraps
   * `resolve` with the full ResolveContext built from the resolver's params.
   */
  decide: (_sourceId: string) => ResolveDecision;
  /**
   * The value a reuse-resolved source contributes to one edge handle:
   *  - Constant   → its live property value (never the cache);
   *  - Generative → the current-or-newest-completed generation's output;
   *  - Computed   → the output of the completed generation whose stamped
   *    `inputSignature` matches the source's current signature.
   * `hasValue: false` only for a Constant whose live value is undefined (which
   * then falls through to "run"); a reused Generative/Computed always has a
   * generation behind it.
   */
  reuseValue: (
    _sourceId: string,
    _edge: Edge
  ) => { value: unknown; hasValue: boolean };
  /**
   * The ordered multi-select value list for a source handle — the selected
   * (pick-ordered, completed, num_images-flattened) outputs streamed by a
   * synthetic ForEach replay node.
   */
  replayValues: (
    _sourceId: string,
    _sourceHandle: string | null | undefined
  ) => unknown[];
  /** Display title for a source node (data title → metadata title → type → id). */
  nodeTitle: (_sourceId: string) => string;
  /** Merged generation history for a node, memoized per resolver. */
  generations: (_sourceId: string) => Generation[];
}

/** Substituted for the real result getter so a constant resolves to its live value. */
const noCachedResult = (): undefined => undefined;

export const createRunResolver = ({
  nodes,
  edges,
  workflowId,
  getMetadata,
  getGenerations,
  now
}: RunResolverParams): RunResolver => {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const findNode = (id: string): Node<NodeData> | undefined => nodeById.get(id);

  const edgesByTarget = new Map<string, Edge[]>();
  for (const e of edges) {
    const list = edgesByTarget.get(e.target);
    if (list) list.push(e);
    else edgesByTarget.set(e.target, [e]);
  }
  const inboundEdges = (id: string): Edge[] => edgesByTarget.get(id) ?? [];

  const genCache = new Map<string, Generation[]>();
  const generationsOf = (id: string): Generation[] => {
    let g = genCache.get(id);
    if (!g) {
      g = getGenerations(workflowId, id);
      genCache.set(id, g);
    }
    return g;
  };

  const selectedGenerationId = (id: string): string | undefined =>
    findNode(id)?.data?.selected_generation;
  const selectedGenerationIds = (id: string): string[] =>
    findNode(id)?.data?.selected_generations ?? [];
  const cacheTtl = (id: string): number | "forever" | undefined => {
    const type = findNode(id)?.type;
    return type ? getMetadata(type)?.cache_ttl : undefined;
  };
  const upstreamIds = (id: string): string[] => {
    const seen = new Set<string>();
    for (const e of inboundEdges(id)) seen.add(e.source);
    return [...seen];
  };

  const hasher = createNodeHasher({
    findNode,
    inboundEdges,
    getMetadata,
    currentGenerationId: (id) =>
      getCurrentGeneration(generationsOf(id), selectedGenerationId(id))?.id
  });

  const resolveCtx: ResolveContext = {
    classify: hasher.classify,
    inputSignature: hasher.inputSignature,
    upstreamIds,
    cacheTtl,
    generations: generationsOf,
    selectedGenerationIds,
    selectedGenerationId,
    now
  };

  const reuseValue = (
    source: string,
    edge: Edge
  ): { value: unknown; hasValue: boolean } => {
    const kind = hasher.classify(source);
    if (kind === "constant") {
      const { value, hasValue } = resolveExternalEdgeValue(
        edge,
        workflowId,
        noCachedResult,
        findNode
      );
      return { value, hasValue };
    }
    const gens = generationsOf(source);
    if (kind === "generative") {
      const current = getCurrentGeneration(gens, selectedGenerationId(source));
      const g =
        current && current.status === "completed"
          ? current
          : newestCompletedGeneration(gens);
      if (!g) return { value: undefined, hasValue: false };
      return {
        value: outputOf(g, edge.sourceHandle ?? undefined),
        hasValue: true
      };
    }
    // Computed: the signature-matching cached generation the resolver reused.
    const g = newestCompletedGenerationForSignature(
      gens,
      hasher.inputSignature(source)
    );
    if (!g) return { value: undefined, hasValue: false };
    return { value: outputOf(g, edge.sourceHandle ?? undefined), hasValue: true };
  };

  const replayValues = (
    source: string,
    sourceHandle: string | null | undefined
  ): unknown[] =>
    selectedOutputValues(
      generationsOf(source),
      selectedGenerationIds(source),
      sourceHandle ?? undefined
    );

  const nodeTitle = (id: string): string => {
    const node = findNode(id);
    if (!node) return id;
    const dataTitle = (node.data as { title?: unknown } | undefined)?.title;
    if (typeof dataTitle === "string" && dataTitle.trim()) {
      return dataTitle;
    }
    const meta = node.type ? getMetadata(node.type) : undefined;
    return meta?.title || node.type || node.id;
  };

  return {
    classify: hasher.classify,
    decide: (sourceId) => resolve(sourceId, resolveCtx),
    reuseValue,
    replayValues,
    nodeTitle,
    generations: generationsOf
  };
};
