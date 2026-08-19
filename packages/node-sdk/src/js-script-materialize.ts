/**
 * Materializing a JS script onto a `nodetool.code.Code` node.
 *
 * A placed custom node is a plain Code node carrying a copy of one pinned
 * script version: its body, secrets and timeout as properties, its
 * declared ports as dynamic slots, and `{id, version}` as provenance. The web
 * editor does this when a script is linked and when a custom node is dropped
 * from the menu, and headless authoring does it when it places one — one
 * mapping, so a dropped node and a linked node cannot differ.
 *
 * Pure: no registry, no store, no I/O.
 */
import type {
  JsScriptLink,
  JsScriptPort
} from "@nodetool-ai/protocol/api-schemas/js-scripts.js";

/** The `TypeMetadata` JSON a Code node's dynamic slots carry. */
export interface JsScriptSlotType {
  type: string;
  optional: boolean;
  type_args: [];
}

/**
 * The part of a script document a Code node copies. Structural rather than the
 * schema type, because callers hold it in several shapes — the tRPC client's
 * output type, the protocol's inferred type, a version snapshot — differing
 * only in optionality nothing here reads.
 */
export interface MaterializableJsScript {
  code: string;
  inputs: readonly JsScriptPort[];
  outputs: readonly JsScriptPort[];
  secrets: readonly string[];
  timeoutSeconds: number;
}

/** The Code node properties a materialized script writes. */
export interface MaterializedJsScriptProperties {
  script: JsScriptLink;
  code: string;
  secrets: readonly string[];
  timeout: number;
}

export interface MaterializedJsScriptNode {
  properties: MaterializedJsScriptProperties;
  dynamic_inputs: Record<string, { type: JsScriptSlotType }>;
  dynamic_outputs: Record<string, JsScriptSlotType>;
}

const slotType = (type: string): JsScriptSlotType => ({
  type,
  optional: false,
  type_args: []
});

export function jsScriptPortsToSlots(
  ports: readonly JsScriptPort[]
): Record<string, { type: JsScriptSlotType }> {
  return Object.fromEntries(
    ports.map((port) => [port.name, { type: slotType(port.type) }])
  );
}

export function jsScriptPortsToOutputs(
  ports: readonly JsScriptPort[]
): Record<string, JsScriptSlotType> {
  return Object.fromEntries(
    ports.map((port) => [port.name, slotType(port.type)])
  );
}

export function materializeJsScriptNode(
  document: MaterializableJsScript,
  link: JsScriptLink
): MaterializedJsScriptNode {
  return {
    properties: {
      script: { id: link.id, version: link.version },
      code: document.code,
      secrets: document.secrets,
      timeout: document.timeoutSeconds
    },
    dynamic_inputs: jsScriptPortsToSlots(document.inputs),
    dynamic_outputs: jsScriptPortsToOutputs(document.outputs)
  };
}
