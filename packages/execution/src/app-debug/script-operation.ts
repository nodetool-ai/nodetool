/**
 * Script operations for the app simulator.
 *
 * A mini-app operation can run a JS script instead of a workflow. A script has
 * no graph, so two things have to be manufactured: the bindable surface the
 * binding layer resolves names against (its declared ports, which are its
 * stable identifiers — a script has no node ids), and the message stream the
 * app-runtime fold consumes.
 *
 * The run endpoint answers with plain JSON, not a stream, so the messages are
 * synthesized here from that result: one `output_update` per `emit` in call
 * order, one per final output, then the terminal `job_update`. Every host that
 * runs a script operation goes through this one adapter, so the simulator and
 * the web runtime cannot fold a script run two different ways.
 */
import {
  jsScriptDocument,
  type JsScriptDocument
} from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import { usesStreamInputContract } from "@nodetool-ai/node-sdk/code-body";
import type { AppIO } from "./types.js";

/** What one script run returned — the shape `POST /api/js-scripts/:id/run` answers with. */
export interface JsScriptRunResult {
  ok: boolean;
  outputs?: Record<string, unknown>;
  /** `{name, value}` entries under the emit contract, in call order. */
  streamed?: unknown[];
  logs: string[];
  error?: string;
  duration_ms: number;
}

/** Run one pinned script's document with the given inputs. */
export type JsScriptOperationRunner = (input: {
  scriptId: string;
  scriptVersion: number;
  name: string;
  document: JsScriptDocument;
  inputs: Record<string, unknown>;
  /** Items staged per handle for a body that reads `stream`. */
  inputStreams?: Record<string, unknown[]>;
  timeoutMs?: number;
}) => Promise<JsScriptRunResult>;

/** How one invocation's mapped values reach the body. */
export interface JsScriptInvocation {
  inputs: Record<string, unknown>;
  inputStreams?: Record<string, unknown[]>;
}

/**
 * Split an operation's mapped values the way the body reads them.
 *
 * An app operation is one shot: a widget holds one value per input, not a
 * stream of them. A body that reads `stream` still has to be fed through the
 * inbox, so each mapped value is staged as a one-item stream and `inputs` stays
 * empty — the split a graph run makes, where a connected handle is reachable
 * through `stream` and never through `inputs`. A buffered body is untouched.
 */
export function scriptOperationInvocation(
  document: JsScriptDocument,
  inputs: Record<string, unknown>
): JsScriptInvocation {
  if (!usesStreamInputContract(document.code)) return { inputs };
  const staged: Record<string, unknown[]> = {};
  for (const [handle, value] of Object.entries(inputs)) {
    staged[handle] = [value];
  }
  return { inputs: {}, inputStreams: staged };
}

/** Resolve a pinned script target to its document. */
export type JsScriptOperationLoader = (
  scriptId: string,
  scriptVersion: number
) => Promise<{ name: string; document: JsScriptDocument } | null>;

/**
 * Parse a document carried loosely (a bundle's structural shape) into the
 * pinned contract, or null when it is not one. A bundle is untrusted input.
 */
export function parseCarriedScriptDocument(
  value: unknown
): JsScriptDocument | null {
  const parsed = jsScriptDocument.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * A script's bindable surface. Port names stand in for node ids: a script
 * declares no nodes, and its port names are what every mapping already keys on.
 */
export function scriptAppIO(document: JsScriptDocument): AppIO {
  return {
    inputs: document.inputs.map((port) => ({
      nodeId: port.name,
      nodeType: `jsscript.input.${port.type}`,
      name: port.name
    })),
    outputs: document.outputs.map((port) => ({
      nodeId: port.name,
      nodeType: `jsscript.output.${port.type}`,
      name: port.name
    })),
    variables: [],
    nodeIds: [
      ...document.inputs.map((port) => port.name),
      ...document.outputs.map((port) => port.name)
    ]
  };
}

const emitEntry = (
  item: unknown
): { name: string; value: unknown } | null => {
  if (item === null || typeof item !== "object" || Array.isArray(item)) {
    return null;
  }
  const record = item as Record<string, unknown>;
  return typeof record.name === "string"
    ? { name: record.name, value: record.value }
    : null;
};

/**
 * The message stream a script run would have produced: its emits in order,
 * then its final outputs, then the job's terminal status.
 *
 * Emits append (they are one output handle streaming), finals replace and mark
 * the handle done — the same dispositions the kernel sends for a streaming
 * node followed by its final bag.
 */
export function jsScriptRunMessages(
  result: JsScriptRunResult
): Array<Record<string, unknown>> {
  const messages: Array<Record<string, unknown>> = [];
  for (const item of result.streamed ?? []) {
    const entry = emitEntry(item);
    if (!entry) continue;
    messages.push({
      type: "output_update",
      node_id: entry.name,
      output_name: entry.name,
      value: entry.value,
      disposition: "append"
    });
  }
  for (const [name, value] of Object.entries(result.outputs ?? {})) {
    messages.push({
      type: "output_update",
      node_id: name,
      output_name: name,
      value,
      disposition: "replace",
      done: true
    });
  }
  messages.push({
    type: "job_update",
    status: result.ok ? "completed" : "failed",
    ...(result.error === undefined ? {} : { error: result.error })
  });
  return messages;
}
