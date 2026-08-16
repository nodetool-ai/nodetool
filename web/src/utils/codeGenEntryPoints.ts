/**
 * Seeding rules shared by the Code Node AI authoring entry points.
 *
 * A handle name becomes a port name on the generated node, so it has to be a
 * JavaScript identifier the generated code can destructure, and it must not
 * collide with a name the node already uses — the Code node's own `code` and
 * `timeout` properties included.
 */
import type { Node } from "@xyflow/react";
import { RESERVED_PORT_NAMES } from "@nodetool-ai/protocol/api-schemas/code-gen.js";
import type { codeGen } from "@nodetool-ai/protocol/api-schemas";

import type { NodeMetadata, TypeMetadata } from "../stores/ApiTypes";
import type { NodeData } from "../stores/NodeData";
import { isString } from "./typePredicates";

/** Matches the `portName` schema the generation request validates against. */
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const MAX_PORT_NAME_LENGTH = 64;

/** Used when a handle name has no identifier characters left to work with. */
const FALLBACK_INPUT_NAME = "value";
const FALLBACK_OUTPUT_NAME = "output";

/**
 * A handle name as a JavaScript identifier: everything outside
 * `[A-Za-z0-9_$]` becomes `_`, a leading digit gets an underscore, and an
 * over-long name is cut to the transport limit.
 */
export function sanitizePortName(raw: string, fallback: string): string {
  const cleaned = (raw ?? "").replace(/[^A-Za-z0-9_$]/g, "_");
  const prefixed = /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned;
  const trimmed = prefixed.slice(0, MAX_PORT_NAME_LENGTH);
  return IDENTIFIER.test(trimmed) ? trimmed : fallback;
}

/**
 * The first free name in `base`, `base_2`, `base_3`, … Reserved words count as
 * taken, so a handle called `default` seeds `default_2` rather than a port name
 * the request schema would reject.
 */
export function uniquePortName(base: string, taken: Iterable<string>): string {
  const used = new Set<string>(taken);
  const isFree = (name: string) =>
    !used.has(name) && !RESERVED_PORT_NAMES.has(name);
  if (isFree(base)) {
    return base;
  }
  const stem = base.slice(0, MAX_PORT_NAME_LENGTH - 3);
  let suffix = 2;
  while (!isFree(`${stem}_${suffix}`)) {
    suffix += 1;
  }
  return `${stem}_${suffix}`;
}

/** Names an input port on this node cannot use. */
function takenInputNames(
  metadata: NodeMetadata,
  node: Node<NodeData>
): string[] {
  return [
    ...(metadata.properties ?? []).map((property) => property.name),
    ...Object.keys(node.data.dynamic_inputs ?? {}),
    ...Object.keys(node.data.dynamic_properties ?? {})
  ];
}

/** Names an output port on this node cannot use. */
function takenOutputNames(
  metadata: NodeMetadata,
  node: Node<NodeData>
): string[] {
  return [
    ...(metadata.outputs ?? []).map((output) => output.name),
    ...Object.keys(node.data.dynamic_outputs ?? {})
  ];
}

/** Port name for an input seeded from the source handle it will be fed by. */
export function seedInputPortName(
  handleId: string,
  metadata: NodeMetadata,
  node: Node<NodeData>
): string {
  return uniquePortName(
    sanitizePortName(handleId, FALLBACK_INPUT_NAME),
    takenInputNames(metadata, node)
  );
}

/** Port name for an output seeded from the destination handle it will feed. */
export function seedOutputPortName(
  handleId: string,
  metadata: NodeMetadata,
  node: Node<NodeData>
): string {
  return uniquePortName(
    sanitizePortName(handleId, FALLBACK_OUTPUT_NAME),
    takenOutputNames(metadata, node)
  );
}

/**
 * Whether a submission has already been written to the node. The dialog closes
 * the same way on Apply and on Cancel, so the host reads the node instead: a
 * node created purely to open the dialog still has the Code node's empty
 * default, while `applyCodeGenSubmission` always writes non-empty code.
 */
export function isCodeGenApplied(node: Node<NodeData> | undefined): boolean {
  const code = node?.data.properties?.code;
  return isString(code) && code.trim().length > 0;
}

/**
 * The editor's `TypeMetadata` as the transport's. The two describe the same
 * shape; only the nullability of the unused fields differs.
 */
export function toCodeGenType(
  type: TypeMetadata
): codeGen.CodeGenTypeMetadata {
  return type as codeGen.CodeGenTypeMetadata;
}
