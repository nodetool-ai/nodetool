import type { Node } from "@xyflow/react";
import type { XYPosition } from "@xyflow/react";
import type { NodeMetadata, TypeMetadata } from "../stores/ApiTypes";
import type { DynamicSlotDeclaration, NodeData } from "../stores/NodeData";
import { defaultValueForType } from "./dynamicSlots";
import { findSnippetByNodeType } from "../config/snippetMetadata";
import { CODE_GEN_PALETTE_NODE_TYPE } from "../config/codeGenPaletteMetadata";
import useMetadataStore from "../stores/MetadataStore";
import useCodeGenDialogStore from "../stores/CodeGenDialogStore";
import {
  inferOutputKeysFromCode,
  inferInputKeysFromCode
} from "./codeOutputInference";
import { CODE_NODE_TYPE } from "../components/node/codeNodeUi";

/**
 * The JSON form the graph converters round-trip: `{type, type_args, optional}`.
 * Kept minimal on purpose — `values` / `type_name` stay absent, matching what
 * `deriveCodeIOUpdates` writes for an untyped Code node.
 */
const typeMetadata = (type: string): TypeMetadata => ({
  type,
  type_args: [],
  optional: false
});

type PaletteCreateNodeFn = (
  metadata: NodeMetadata,
  position: XYPosition,
  properties?: Record<string, unknown>
) => Node<NodeData>;

export interface PaletteNodeInstance {
  node: Node<NodeData>;
  /** Dynamic IO to merge once the node exists in the store. */
  afterAdd?: Partial<NodeData>;
  /** Run after `addNode` — for entry points that open UI on the new node. */
  onAdded?: (nodeId: string) => void;
}

/**
 * Turn node-menu metadata into a concrete ReactFlow node. Code snippets and
 * the "Write Code with AI" entry use a virtual `node_type` in the palette;
 * both become real `nodetool.code.Code` nodes — the snippet with its body, the
 * AI entry empty and with the generation dialog opened against it.
 *
 * For snippets, call `updateNodeData(node.id, afterAdd)` after `addNode(node)` —
 * dynamic IO is merged only once the node exists in the store.
 */
export function instantiatePaletteNode(
  metadata: NodeMetadata,
  position: XYPosition,
  createNode: PaletteCreateNodeFn
): PaletteNodeInstance {
  if (metadata.node_type === CODE_GEN_PALETTE_NODE_TYPE) {
    const codeMetadata = useMetadataStore.getState().getMetadata(CODE_NODE_TYPE);
    if (codeMetadata) {
      const node = createNode(codeMetadata, position);
      return {
        node,
        onAdded: (nodeId: string) => {
          useCodeGenDialogStore.getState().openCodeGenDialog({
            nodeId,
            discard: { nodeIds: [nodeId], edgeIds: [], restoreEdges: [] }
          });
        }
      };
    }
  }

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
        const dynOutputs: Record<string, TypeMetadata> = {};
        for (const key of outputKeys) {
          dynOutputs[key] = typeMetadata(snippet.outputs?.[key] ?? "any");
        }
        afterAdd.dynamic_outputs = dynOutputs;
      }
      if (inputKeys) {
        const dynProps: Record<string, unknown> = {};
        const dynInputs: Record<string, DynamicSlotDeclaration> = {};
        for (const key of inputKeys) {
          const declared = snippet.inputs?.[key];
          dynProps[key] = declared
            ? declared.default ?? defaultValueForType(typeMetadata(declared.type))
            : "";
          if (declared) {
            dynInputs[key] = {
              type: typeMetadata(declared.type),
              ...(declared.description !== undefined
                ? { description: declared.description }
                : {}),
              ...(declared.default !== undefined
                ? { default: declared.default }
                : {}),
              ...(declared.min !== undefined ? { min: declared.min } : {}),
              ...(declared.max !== undefined ? { max: declared.max } : {})
            };
          }
        }
        afterAdd.dynamic_properties = dynProps;
        if (Object.keys(dynInputs).length > 0) {
          afterAdd.dynamic_inputs = dynInputs;
        }
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
