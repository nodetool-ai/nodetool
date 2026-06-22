import { useMemo } from "react";

import { useNodes } from "../../../contexts/NodeContext";
import type { NodeStoreState } from "../../../stores/NodeStore";
import useMetadataStore from "../../../stores/MetadataStore";
import { findOutputHandle } from "../../../utils/handleUtils";
import type { TypeMetadata } from "../../../stores/ApiTypes";
import {
  collectVariableNames,
  inferVariableTypes,
  type VariableGraphEdge,
  type VariableGraphNode
} from "./variableGraph";

/**
 * Names of every variable defined by a Set Variable node anywhere in the
 * workflow. The shared processing context makes these readable from any node,
 * so the editor offers them everywhere.
 *
 * The selector caches by the `nodes` array identity (which the store replaces
 * on every mutation) and returns a referentially-stable array while the
 * resolved names are unchanged, so consumers don't re-render on unrelated
 * graph edits.
 */
export const useGraphVariableNames = (): string[] =>
  useNodes(
    useMemo(() => {
      let lastNodes: readonly VariableGraphNode[] | null = null;
      let lastResult: string[] = [];
      return (state: NodeStoreState): string[] => {
        const nodes = state.nodes as readonly VariableGraphNode[];
        if (nodes === lastNodes) {
          return lastResult;
        }
        lastNodes = nodes;
        const next = collectVariableNames(nodes);
        if (
          next.length === lastResult.length &&
          next.every((name, index) => name === lastResult[index])
        ) {
          return lastResult;
        }
        lastResult = next;
        return lastResult;
      };
    }, [])
  );

/**
 * Map of variable name → inferred type, derived from whatever feeds each Set
 * Variable's `value` input. Lets a Get Variable type its output handle so reads
 * are validated by the normal edge-compatibility checks.
 */
export const useGraphVariableTypes = (): Map<string, TypeMetadata> => {
  const getMetadata = useMetadataStore((state) => state.getMetadata);
  return useNodes(
    useMemo(() => {
      let lastNodes: NodeStoreState["nodes"] | null = null;
      let lastEdges: NodeStoreState["edges"] | null = null;
      let lastResult = new Map<string, TypeMetadata>();
      return (state: NodeStoreState): Map<string, TypeMetadata> => {
        if (state.nodes === lastNodes && state.edges === lastEdges) {
          return lastResult;
        }
        lastNodes = state.nodes;
        lastEdges = state.edges;
        const resolveOutputType = (sourceId: string, handle: string) => {
          const source = state.nodes.find((n) => n.id === sourceId);
          if (!source?.type) {
            return undefined;
          }
          const metadata = getMetadata(source.type);
          if (!metadata) {
            return undefined;
          }
          return findOutputHandle(source, handle, metadata)?.type;
        };
        lastResult = inferVariableTypes(
          state.nodes as readonly VariableGraphNode[],
          state.edges as readonly VariableGraphEdge[],
          resolveOutputType
        );
        return lastResult;
      };
    }, [getMetadata])
  );
};
