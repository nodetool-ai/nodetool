/**
 * A Code node linked to a JS script document.
 *
 * A `nodetool.code.Code` node carries either an inline body or a link to one
 * pinned version of a script (`{id, version}` in its `script` property). While
 * linked, the script supplies the body, the packages, the secrets, and the
 * timeout, and the node's own `code` is ignored.
 *
 * The port rule lives here so the graph validator and the node's runtime read
 * one implementation: the script's declared ports are the node's contract, so
 * an input the script reads that the node has no slot for, or a slot the script
 * does not declare, is a mismatch either way.
 */
import type {
  JsScriptLink,
  ResolvedJsScript
} from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import { parseJsScriptLink } from "@nodetool-ai/protocol/api-schemas/js-scripts.js";

export type { JsScriptLink, ResolvedJsScript };
export { parseJsScriptLink };

/** The Code node property holding the link. */
export const JS_SCRIPT_LINK_PROP = "script";

/**
 * Read a node's `script` property as a link. An unlinked node stores `{}`,
 * `null`, or nothing at all, and all three read as "no link".
 */
export function readJsScriptLink(
  properties: Record<string, unknown> | undefined
): JsScriptLink | null {
  return parseJsScriptLink(properties?.[JS_SCRIPT_LINK_PROP]);
}

/** A synchronous lookup of a pinned link, for hosts that prefetched. */
export type JsScriptLinkLookup = (
  link: JsScriptLink
) => ResolvedJsScript | undefined;

export interface JsScriptPortDiffInput {
  /** Input port names the script declares. */
  scriptInputs: readonly string[];
  /** Output port names the script declares. */
  scriptOutputs: readonly string[];
  /** Input slot names the node offers (declared slots plus connected handles). */
  nodeInputs: readonly string[];
  /** Output handle names the node declares. */
  nodeOutputs: readonly string[];
}

const list = (names: readonly string[]): string =>
  names.map((name) => `"${name}"`).join(", ");

/**
 * Script inputs the node cannot feed. The one direction a running node can
 * still decide — it knows its own inputs, but not which output handles the
 * graph declared for it — so the node's runtime checks this and the graph
 * validator checks all four.
 */
export function missingScriptInputs(
  scriptInputs: readonly string[],
  nodeInputs: readonly string[]
): string[] {
  const available = new Set(nodeInputs);
  return scriptInputs.filter((name) => !available.has(name));
}

/**
 * Where a linked script's declared ports and the node's slots disagree, as
 * human-readable messages. Empty means the node can run the script.
 *
 * Both directions are reported. A script input the node cannot feed arrives
 * `undefined`; a node slot the script never declares is an edge carrying a
 * value nothing reads. Neither is visible until the graph runs.
 */
export function jsScriptPortMismatches(
  input: JsScriptPortDiffInput
): string[] {
  const messages: string[] = [];
  const nodeOutputs = new Set(input.nodeOutputs);

  const missingInputs = missingScriptInputs(
    input.scriptInputs,
    input.nodeInputs
  );
  if (missingInputs.length > 0) {
    messages.push(
      `the linked script declares input${missingInputs.length > 1 ? "s" : ""} ` +
        `${list(missingInputs)}, which the node has no slot for`
    );
  }

  const scriptInputs = new Set(input.scriptInputs);
  const extraInputs = input.nodeInputs.filter(
    (name) => !scriptInputs.has(name)
  );
  if (extraInputs.length > 0) {
    messages.push(
      `the node has input slot${extraInputs.length > 1 ? "s" : ""} ` +
        `${list(extraInputs)}, which the linked script does not declare`
    );
  }

  const missingOutputs = input.scriptOutputs.filter(
    (name) => !nodeOutputs.has(name)
  );
  if (missingOutputs.length > 0) {
    messages.push(
      `the linked script declares output${missingOutputs.length > 1 ? "s" : ""} ` +
        `${list(missingOutputs)}, which the node does not declare`
    );
  }

  const scriptOutputs = new Set(input.scriptOutputs);
  const extraOutputs = input.nodeOutputs.filter(
    (name) => !scriptOutputs.has(name)
  );
  if (extraOutputs.length > 0) {
    messages.push(
      `the node declares output${extraOutputs.length > 1 ? "s" : ""} ` +
        `${list(extraOutputs)}, which the linked script does not produce`
    );
  }

  return messages;
}
