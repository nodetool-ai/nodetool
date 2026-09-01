/**
 * Helpers for driving the `ui_*` frontend tools from a test.
 *
 * The registry stores every tool behind one signature, so `call` answers
 * `unknown` and `FrontendToolState` is a wide interface a tool reads two or
 * three members of. These put the check back where a per-call-site assertion
 * skipped it.
 */

import {
  FrontendToolRegistry,
  type FrontendToolContext,
  type FrontendToolState
} from "../lib/tools/frontendTools";
import type { NodeMetadata } from "../stores/ApiTypes";
import type { JsonSchema } from "@nodetool-ai/runtime/zod-schema";
import { isArray, isRecord, isString } from "../utils/typePredicates";
import { stub, type PartialMembers } from "./doubles";

/** The argument bag a caller hands `FrontendToolRegistry.call`. */
type ToolCallArgs = Parameters<typeof FrontendToolRegistry.call>[1];

/** What `FrontendToolRegistry.call` needs of a context: the state getter. */
type ToolCallContext = Omit<FrontendToolContext, "abortSignal">;

/**
 * Calls a tool and reads its result at the shape the test names.
 *
 * A tool that answers with something other than an object fails here, saying
 * what it answered — instead of failing three lines later on a property read
 * against a value an assertion claimed was an object.
 */
export async function callTool<T extends object>(
  name: string,
  args: ToolCallArgs,
  toolCallId: string,
  ctx: ToolCallContext
): Promise<T> {
  const result = await FrontendToolRegistry.call(name, args, toolCallId, ctx);
  if (!isRecord(result)) {
    throw new Error(
      `tool ${name} answered with ${JSON.stringify(result)}, not an object`
    );
  }
  // SAFETY: the result is an object; which object is the tool's own contract,
  // which the registry erases and the caller restates.
  return result as T;
}

/**
 * A `FrontendToolState` carrying the members the tool under test reads. Every
 * one is checked against the real interface, so renaming a state member breaks
 * the test at compile time.
 */
export function toolState(
  members: PartialMembers<FrontendToolState> = {}
): FrontendToolState {
  return stub<FrontendToolState>(members);
}

/** A tool context over the given state, for `FrontendToolRegistry.call`. */
export function toolContext(
  members: PartialMembers<FrontendToolState> = {}
): ToolCallContext {
  const state = toolState(members);
  return { getState: () => state };
}

/**
 * The node-metadata map a tool reads, built from the members each entry needs.
 *
 * `stub` checks every member against the real `NodeMetadata`, so a property or
 * output written the wrong way is a compile error instead of metadata the tool
 * silently skips.
 */
export function nodeMetadataMap(
  entries: Record<string, PartialMembers<NodeMetadata>>
): Record<string, NodeMetadata> {
  return Object.fromEntries(
    Object.entries(entries).map(([nodeType, members]) => [
      nodeType,
      stub<NodeMetadata>(members)
    ])
  );
}

/** The parts of a tool's parameter JSON Schema a test reads. */
export interface ToolParameterSchema {
  type?: string;
  properties: Record<string, ToolParameterSchema>;
  required: string[];
  enum?: string[];
}

function readObjectSchema(node: JsonSchema[string]): ToolParameterSchema {
  const raw = isRecord(node) ? node : {};
  const properties: Record<string, ToolParameterSchema> = {};
  if (isRecord(raw.properties)) {
    for (const [key, value] of Object.entries(raw.properties)) {
      properties[key] = readObjectSchema(value);
    }
  }
  return {
    type: isString(raw.type) ? raw.type : undefined,
    properties,
    required: isArray(raw.required) ? raw.required.filter(isString) : [],
    enum: isArray(raw.enum) ? raw.enum.filter(isString) : undefined
  };
}

/**
 * Reads a registered tool's parameter JSON Schema out of the manifest.
 *
 * `getManifest` types `parameters` as a bare `Record<string, unknown>` — it
 * carries whatever `zodToJsonSchema` produced — so the shape is narrowed here
 * once, recursively. A tool that is not registered fails naming itself.
 */
export function toolParameterSchema(name: string): ToolParameterSchema {
  const entry = FrontendToolRegistry.getManifest().find((t) => t.name === name);
  if (!entry) {
    throw new Error(`tool ${name} is not in the manifest`);
  }
  return readObjectSchema(entry.parameters);
}
