import { useMemo } from "react";

import { useNodes } from "../../../contexts/NodeContext";
import type { NodeStoreState } from "../../../stores/NodeStore";
import {
  collectUpstreamVariableNames,
  type VariableGraphEdge,
  type VariableGraphNode
} from "./variableGraph";

/**
 * Variable names set by Set Variable nodes upstream of `nodeId`.
 *
 * The selector caches by the `nodes`/`edges` array identities (which the store
 * replaces on every mutation) and returns a referentially-stable array while
 * the resolved names are unchanged, so consumers don't re-render on unrelated
 * graph edits.
 */
export const useUpstreamVariableNames = (nodeId: string): string[] =>
  useNodes(
    useMemo(() => {
      let lastNodes: readonly VariableGraphNode[] | null = null;
      let lastEdges: readonly VariableGraphEdge[] | null = null;
      let lastResult: string[] = [];
      return (state: NodeStoreState): string[] => {
        const nodes = state.nodes as readonly VariableGraphNode[];
        const edges = state.edges as readonly VariableGraphEdge[];
        if (nodes === lastNodes && edges === lastEdges) {
          return lastResult;
        }
        lastNodes = nodes;
        lastEdges = edges;
        const next = collectUpstreamVariableNames(nodeId, nodes, edges);
        if (
          next.length === lastResult.length &&
          next.every((name, index) => name === lastResult[index])
        ) {
          return lastResult;
        }
        lastResult = next;
        return lastResult;
      };
    }, [nodeId])
  );
