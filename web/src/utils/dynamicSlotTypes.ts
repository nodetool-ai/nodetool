/**
 * The palette a user can pick from when typing a dynamic slot, and the rule
 * for when picking is allowed at all.
 *
 * v1 is deliberately small: primitives, asset refs, and `list[T]` of those.
 * Union editing is out of scope — `any` covers it.
 */
import type { Node } from "@xyflow/react";

import type { NodeMetadata, TypeMetadata } from "../stores/ApiTypes";
import type { NodeData } from "../stores/NodeData";
import {
  DYNAMIC_COMFY_NODE_TYPES,
  DYNAMIC_FAL_NODE_TYPE,
  DYNAMIC_KIE_NODE_TYPE,
  DYNAMIC_REPLICATE_NODE_TYPE,
  SUBGRAPH_NODE_TYPE,
  WORKFLOW_NODE_TYPE
} from "../constants/nodeTypes";
import { typeToString } from "./TypeHandler";

const scalar = (type: string): TypeMetadata => ({
  type,
  optional: false,
  values: null,
  type_args: [],
  type_name: null
});

const listOf = (type: TypeMetadata): TypeMetadata => ({
  type: "list",
  optional: false,
  values: null,
  type_args: [type],
  type_name: null
});

/** Base types offered by the picker, in menu order. */
const BASE_SLOT_TYPES: readonly string[] = [
  "any",
  "str",
  "int",
  "float",
  "bool",
  "image",
  "audio",
  "video",
  "document",
  "dataframe"
];

/** Primitives + asset refs + `list[T]` of each (except `any`). */
export const DYNAMIC_SLOT_TYPE_PALETTE: readonly TypeMetadata[] = [
  ...BASE_SLOT_TYPES.map(scalar),
  ...BASE_SLOT_TYPES.filter((t) => t !== "any").map((t) => listOf(scalar(t)))
];

/** Stable identity for a palette entry — used as select value and React key. */
export const slotTypeKey = (type: TypeMetadata): string =>
  type.type === "list" && type.type_args?.length === 1
    ? `list[${type.type_args[0].type}]`
    : type.type;

/** Human label, matching the handle tooltips (`str`, `image[]`, …). */
export const slotTypeLabel = (type: TypeMetadata): string => typeToString(type);

/**
 * Types this node allows in a dynamic slot. `allowed_dynamic_slot_types` on
 * the node class narrows the palette; unset means the whole palette.
 */
export const allowedSlotTypes = (
  metadata: NodeMetadata | undefined
): readonly TypeMetadata[] => {
  const allowed = metadata?.allowed_dynamic_slot_types;
  if (!allowed || allowed.length === 0) {
    return DYNAMIC_SLOT_TYPE_PALETTE;
  }
  const allowedKeys = new Set(allowed.map((t) => slotTypeKey(t)));
  const fromPalette = DYNAMIC_SLOT_TYPE_PALETTE.filter((t) =>
    allowedKeys.has(slotTypeKey(t))
  );
  // A declared type the palette doesn't cover is still offered verbatim.
  const covered = new Set(fromPalette.map((t) => slotTypeKey(t)));
  const extras = allowed.filter((t) => !covered.has(slotTypeKey(t)));
  return [...fromPalette, ...extras];
};

const SCHEMA_DRIVEN_NODE_TYPES: ReadonlySet<string> = new Set([
  DYNAMIC_FAL_NODE_TYPE,
  DYNAMIC_KIE_NODE_TYPE,
  DYNAMIC_REPLICATE_NODE_TYPE,
  ...DYNAMIC_COMFY_NODE_TYPES,
  // Legacy aliases still present in saved graphs.
  "kie.DynamicKie",
  // These derive their slots from an inner graph's Input nodes.
  WORKFLOW_NODE_TYPE,
  SUBGRAPH_NODE_TYPE
]);

/**
 * True when something other than the user owns this node's `dynamic_inputs`:
 * a model schema (FAL/Kie/Replicate/Comfy) or an inner graph. Those resolvers
 * rewrite the map wholesale, so a user-picked type would not survive — type
 * editing is disabled there (they already carry correct types).
 */
export const isSchemaDrivenDynamicNode = (
  node: Pick<Node<NodeData>, "type" | "data">
): boolean =>
  SCHEMA_DRIVEN_NODE_TYPES.has(node.type ?? "") ||
  Boolean(node.data?.endpoint_id) ||
  Boolean(node.data?.model_id);
