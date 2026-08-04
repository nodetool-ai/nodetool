import { useMemo } from "react";
import type { NodeTypes } from "@xyflow/react";
import useMetadataStore from "../../stores/MetadataStore";
import PlaceholderNode from "./PlaceholderNode";

/**
 * ReactFlow `nodeTypes` entries for node types a loaded graph referenced but the
 * registry does not know. `NodeStore` records their names as it sanitizes a
 * graph; mapping them to the component happens here, in the render layer, so
 * the stores never import a node body — `PlaceholderNode` renders full node
 * inputs and outputs, and reaching it from a store put Monaco, Lexical and
 * three.js on the app's boot path.
 *
 * Spread after the base node types, the same way it used to arrive through
 * `MetadataStore.nodeTypes`.
 */
export const usePlaceholderNodeTypes = (): NodeTypes => {
  const unknownNodeTypes = useMetadataStore((state) => state.unknownNodeTypes);
  return useMemo(
    () =>
      Object.fromEntries(
        unknownNodeTypes.map((nodeType) => [nodeType, PlaceholderNode])
      ) satisfies NodeTypes,
    [unknownNodeTypes]
  );
};
