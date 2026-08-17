/**
 * Script operations for the app simulator.
 *
 * The contract itself — the synthesized message stream and the port surface
 * that stands in for a graph — lives in `@nodetool-ai/app-runtime`
 * (`script-run.ts`), because the browser runs script operations too and cannot
 * depend on this package. What is left here is the part that needs a parser:
 * binding the pinned Zod document and deciding, from the body, whether the
 * mapped values are staged as streams.
 */
import {
  scriptInvocationInput,
  scriptPortIO,
  scriptRunMessages,
  type ScriptRunResult
} from "@nodetool-ai/app-runtime";
import {
  jsScriptDocument,
  type JsScriptDocument
} from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import { usesStreamInputContract } from "@nodetool-ai/node-sdk/code-body";
import type { AppIO } from "./types.js";

/** What one script run returned — the shape `POST /api/js-scripts/:id/run` answers with. */
export type JsScriptRunResult = ScriptRunResult;

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
interface JsScriptInvocation {
  inputs: Record<string, unknown>;
  inputStreams?: Record<string, unknown[]>;
}

/**
 * Split an operation's mapped values the way the body reads them — staged as
 * one-item streams when the body reads `stream`, untouched otherwise.
 */
export function scriptOperationInvocation(
  document: JsScriptDocument,
  inputs: Record<string, unknown>
): JsScriptInvocation {
  return scriptInvocationInput(inputs, usesStreamInputContract(document.code));
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
  const io = scriptPortIO(document);
  return { ...io, variables: [] };
}

/**
 * The message stream a script run would have produced: its emits in order,
 * then its final outputs, then the job's terminal status.
 */
export function jsScriptRunMessages(
  result: JsScriptRunResult
): Array<Record<string, unknown>> {
  return scriptRunMessages(result);
}
