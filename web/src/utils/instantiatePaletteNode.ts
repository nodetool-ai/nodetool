import type { Node } from "@xyflow/react";
import type { XYPosition } from "@xyflow/react";
import type { NodeMetadata } from "../stores/ApiTypes";
import type { NodeData } from "../stores/NodeData";
import { findSnippetByNodeType } from "../config/snippetMetadata";
import useMetadataStore from "../stores/MetadataStore";
import {
  inferOutputKeysFromCode,
  inferInputKeysFromCode
} from "./codeOutputInference";
import { CODE_NODE_TYPE } from "../components/node/codeNodeUi";

type PaletteCreateNodeFn = (
  metadata: NodeMetadata,
  position: XYPosition,
  properties?: Record<string, unknown>
) => Node<NodeData>;

/**
 * Turn node-menu metadata into a concrete ReactFlow node. Code snippets use a
 * virtual `node_type` in the palette; they become real `nodetool.code.Code`
 * nodes with the snippet body (same as clicking the menu item).
 *
 * For snippets, call `updateNodeData(node.id, afterAdd)` after `addNode(node)` —
 * dynamic IO is merged only once the node exists in the store.
 */
export function instantiatePaletteNode(
  metadata: NodeMetadata,
  position: XYPosition,
  createNode: PaletteCreateNodeFn
): { node: Node<NodeData>; afterAdd?: Partial<NodeData> } {
  const snippet = findSnippetByNodeType(metadata.node_type);
  if (snippet) {
    const codeMetadata = useMetadataStore.getState().getMetadata(CODE_NODE_TYPE);
    if (codeMetadata) {
      const node = createNode(codeMetadata, position, { code: snippet.code });
      node.data.title = snippet.title;
      node.data.codeNodeMode = "snippet";

      const outputKeys = inferOutputKeysFromCode(snippet.code);
      const inputKeys = inferInputKeysFromCode(snippet.code);
      const afterAdd: Partial<NodeData> = {};
      if (outputKeys) {
        const dynOutputs: Record<
          string,
          { type: string; type_args: never[]; optional: boolean }
        > = {};
        for (const key of outputKeys) {
          dynOutputs[key] = { type: "any", type_args: [], optional: false };
        }
        afterAdd.dynamic_outputs = dynOutputs;
      }
      if (inputKeys) {
        const dynProps: Record<string, unknown> = {};
        for (const key of inputKeys) {
          dynProps[key] = "";
        }
        afterAdd.dynamic_properties = dynProps;
      }
      const hasFollowUp =
        (afterAdd.dynamic_outputs && Object.keys(afterAdd.dynamic_outputs).length > 0) ||
        (afterAdd.dynamic_properties &&
          Object.keys(afterAdd.dynamic_properties).length > 0);

      return { node, afterAdd: hasFollowUp ? afterAdd : undefined };
    }
  }

  return { node: createNode(metadata, position) };
}
