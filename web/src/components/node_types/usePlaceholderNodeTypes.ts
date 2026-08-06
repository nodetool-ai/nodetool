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
  const nodeTypes = useMetadataStore((state) => state.nodeTypes);
  return useMemo(
    () =>
      Object.fromEntries(
        unknownNodeTypes
          // A graph opened before the registry finished loading records every
          // one of its types as unknown. The set is append-only, and these
          // entries are spread over the real ones — so without this filter a
          // type the registry knows keeps rendering as a placeholder for the
          // rest of the session.
          .filter((nodeType) => !nodeTypes[nodeType])
          .map((nodeType) => [nodeType, PlaceholderNode])
      ) satisfies NodeTypes,
    [unknownNodeTypes, nodeTypes]
  );
};
