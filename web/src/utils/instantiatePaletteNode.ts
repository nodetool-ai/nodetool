import type { Node } from "@xyflow/react";
import type { XYPosition } from "@xyflow/react";
import type { NodeMetadata, TypeMetadata } from "../stores/ApiTypes";
import type { DynamicSlotDeclaration, NodeData } from "../stores/NodeData";
import { defaultValueForType } from "./dynamicSlots";
import { findSnippetByNodeType } from "../config/snippetMetadata";
import { findCustomNodeScript } from "../config/customNodeMetadata";
import { CODE_GEN_PALETTE_NODE_TYPE } from "../config/codeGenPaletteMetadata";
import useMetadataStore from "../stores/MetadataStore";
import useCodeGenDialogStore from "../stores/CodeGenDialogStore";
import {
  inferOutputKeysFromCode,
  inferInputKeysFromCode
} from "./codeOutputInference";
import { CODE_NODE_TYPE } from "../components/node/codeNodeUi";
import { materializeJsScriptNode } from "@nodetool-ai/node-sdk/js-script-materialize";

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

interface PaletteNodeInstance {
  node: Node<NodeData>;
  /** Dynamic IO to merge once the node exists in the store. */
  afterAdd?: Partial<NodeData>;
  /** Run after `addNode` — for entry points that open UI on the new node. */
  onAdded?: (nodeId: string) => void;
}

/**
 * Turn node-menu metadata into a concrete ReactFlow node. Code snippets, the
 * user's own custom nodes (`user.*`) and the "Write Code with AI" entry use a
 * virtual `node_type` in the palette; all three become real
 * `nodetool.code.Code` nodes — the snippet with its body, the custom node with
 * its script materialized and pinned, the AI entry empty and with the
 * generation dialog opened against it.
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
    const codeMetadata = useMetadataStore
      .getState()
      .getMetadata(CODE_NODE_TYPE);
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

  const custom = findCustomNodeScript(metadata.node_type);
  if (custom) {
    const codeMetadata = useMetadataStore
      .getState()
      .getMetadata(CODE_NODE_TYPE);
    if (codeMetadata) {
      // The drop pins the version the user saw in the menu; editing the
      // library script later does not touch this node until they update it.
      const materialized = materializeJsScriptNode(custom.document, {
        id: custom.id,
        version: custom.version
      });
      const node = createNode(codeMetadata, position, {
        ...materialized.properties
      });
      node.data.title = custom.name;
      node.data.codeNodeMode = "custom";

      const afterAdd: Partial<NodeData> = {
        dynamic_inputs: materialized.dynamic_inputs,
        dynamic_outputs: materialized.dynamic_outputs,
        dynamic_properties: Object.fromEntries(
          custom.document.inputs.map((port) => [
            port.name,
            defaultValueForType(typeMetadata(port.type))
          ])
        )
      };
      return { node, afterAdd };
    }
  }

  const snippet = findSnippetByNodeType(metadata.node_type);
  if (snippet) {
    const codeMetadata = useMetadataStore
      .getState()
      .getMetadata(CODE_NODE_TYPE);
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
            ? (declared.default ??
              defaultValueForType(typeMetadata(declared.type)))
            : "";
          if (declared) {
            const slot: DynamicSlotDeclaration = {
              type: typeMetadata(declared.type)
            };
            if (declared.description !== undefined) {
              slot.description = declared.description;
            }
            if (declared.default !== undefined) {
              slot.default = declared.default;
            }
            if (declared.min !== undefined) slot.min = declared.min;
            if (declared.max !== undefined) slot.max = declared.max;
            dynInputs[key] = slot;
          }
        }
        afterAdd.dynamic_properties = dynProps;
        if (Object.keys(dynInputs).length > 0) {
          afterAdd.dynamic_inputs = dynInputs;
        }
      }
      const hasFollowUp =
        (afterAdd.dynamic_outputs &&
          Object.keys(afterAdd.dynamic_outputs).length > 0) ||
        (afterAdd.dynamic_properties &&
          Object.keys(afterAdd.dynamic_properties).length > 0);

      return { node, afterAdd: hasFollowUp ? afterAdd : undefined };
    }
  }

  return { node: createNode(metadata, position) };
}
