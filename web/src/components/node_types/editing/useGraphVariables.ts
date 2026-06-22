import { useMemo } from "react";

import { useNodes } from "../../../contexts/NodeContext";
import type { NodeStoreState } from "../../../stores/NodeStore";
import {
  collectVariableNames,
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
