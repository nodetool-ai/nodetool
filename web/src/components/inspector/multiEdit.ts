import type { Edge, Node } from "@xyflow/react";

import type { NodeMetadata, Property } from "../../stores/ApiTypes";
import type { NodeData } from "../../stores/NodeData";
import isEqual from "../../utils/isEqual";
import { shouldRenderProperty } from "../../utils/propertyVisibility";

export interface NodeWithMetadata {
  node: Node<NodeData>;
  metadata: NodeMetadata;
}

/**
 * Returns fields that every selected node can safely edit together.
 * A connected or conditionally hidden input is not batch-editable because its
 * stored fallback is not the value currently driving every selected node.
 */
export const getSharedEditableProperties = (
  entries: readonly NodeWithMetadata[],
  edges: readonly Edge[]
): Property[] => {
  if (entries.length < 2) {
    return [];
  }
  const first = entries[0];
  if (!first) {
    return [];
  }

  const connectedInputs = new Set(
    edges
      .filter((edge) => edge.targetHandle)
      .map((edge) => `${edge.target}:${edge.targetHandle}`)
  );
  return first.metadata.properties.filter((property) => {
    if (property.json_schema_extra?.hidden_in_inspector === true) {
      return false;
    }

    return entries.every(({ node, metadata }) => {
      const matching = metadata.properties.find(
        (candidate) => candidate.name === property.name
      );
      if (
        !matching ||
        matching.json_schema_extra?.hidden_in_inspector === true ||
        !isEqual(matching.type, property.type)
      ) {
        return false;
      }
      if (connectedInputs.has(`${node.id}:${property.name}`)) {
        return false;
      }
      return shouldRenderProperty(matching, node.data.properties, false);
    });
  });
};
