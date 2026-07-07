/**
 * Output-type inference registry.
 *
 * Some nodes declare a static output type that doesn't capture what the node
 * actually emits — the *effective* type depends on the node's instance state.
 * Two families exist today:
 *
 *   - Content-derived: the type is computed from the node's own properties.
 *     e.g. Select nodes output an enum built from their `options`.
 *   - Adopted: the type is persisted on `dynamic_outputs.output` by a bespoke
 *     body and read back here. e.g. Get Variable adopts the variable's type;
 *     Asset Collection adopts its locked media type.
 *
 * `findOutputHandle` / `getAllOutputHandles` consult this registry so the
 * effective type flows everywhere: handle color, tooltips, edge coloring, and
 * connection validation. Adding a node here is the one place to wire a new
 * "my output type isn't statically knowable" node.
 */
import { Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";
import { OutputSlot, TypeMetadata } from "../stores/ApiTypes";
import {
  COLLECTION_NODE_TYPE,
  GET_VARIABLE_NODE_TYPE
} from "../constants/nodeTypes";

/** The resolved output, ready to merge over the static `OutputSlot`. */
export interface InferredOutput {
  type: TypeMetadata;
  isDynamic: boolean;
  /** Overrides the static `stream` flag when set. */
  stream?: boolean;
}

type OutputTypeInferrer = (
  node: Node<NodeData>,
  handleName: string,
  staticOutput: OutputSlot
) => InferredOutput | undefined;

/**
 * Node types whose `output` is an enum-like type built from instance
 * properties (`enum_type_name`, `options`).
 */
const SELECT_NODE_TYPES = [
  "nodetool.input.SelectInput",
  "nodetool.constant.Select"
];

/** Effective enum type for a Select node, from its instance properties. */
function selectNodeEnumType(node: Node<NodeData>): TypeMetadata {
  const props = node.data.properties || {};
  const enumTypeName =
    typeof props.enum_type_name === "string" ? props.enum_type_name : null;
  const options = Array.isArray(props.options)
    ? props.options.filter((x: unknown): x is string => typeof x === "string")
    : [];
  return {
    type: "enum",
    optional: false,
    values: options.length > 0 ? options : null,
    type_args: [],
    type_name: enumTypeName
  };
}

const selectInferrer: OutputTypeInferrer = (node, handleName) =>
  handleName === "output"
    ? { type: selectNodeEnumType(node), isDynamic: false }
    : undefined;

/**
 * Adopt the type persisted on `dynamic_outputs.output` by the node's bespoke
 * body (Get Variable, Asset Collection). Falls back to the static type when no
 * type has been inferred yet, so an unconfigured node stays permissive.
 */
const adoptDynamicOutputInferrer: OutputTypeInferrer = (
  node,
  handleName,
  staticOutput
) => {
  if (handleName !== "output") return undefined;
  const inferred = node.data.dynamic_outputs?.output;
  return {
    type: inferred ?? staticOutput.type,
    isDynamic: Boolean(inferred),
    stream: true
  };
};

const OUTPUT_TYPE_INFERRERS: Record<string, OutputTypeInferrer> = {
  [GET_VARIABLE_NODE_TYPE]: adoptDynamicOutputInferrer,
  [COLLECTION_NODE_TYPE]: adoptDynamicOutputInferrer,
  ...Object.fromEntries(SELECT_NODE_TYPES.map((t) => [t, selectInferrer]))
};

/**
 * Resolve the effective type of one static output handle, or undefined to use
 * the declared static type unchanged.
 */
export function inferOutputType(
  nodeType: string,
  node: Node<NodeData>,
  handleName: string,
  staticOutput: OutputSlot
): InferredOutput | undefined {
  return OUTPUT_TYPE_INFERRERS[nodeType]?.(node, handleName, staticOutput);
}
