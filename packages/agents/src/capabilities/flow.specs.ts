/**
 * The `flow` module's specs — data only, no implementation.
 *
 * Split out for the same reason every other module splits: the registry's
 * eager spec table imports this file and never `flow.ts`, so nothing the
 * implementation pulls in (the DSL's node registry, six node packs) reaches
 * the entry graph.
 */

import type { CapabilitySpec } from "./types.js";
import type { JsonSchema } from "@nodetool-ai/runtime";

/** How deep a chain of guest-invoked nodes may go before it is refused. */
export const MAX_FLOW_INVOKE_DEPTH = 4;

/** Streams one run may hold open at once. */
export const MAX_OPEN_NODE_STREAMS = 16;

const TYPE_FIELD = {
  type: "string" as const,
  description:
    'The node type, e.g. "nodetool.text.Concat". Use search_nodes / ' +
    "get_node_info to find one and read its input and output handles."
};

const INPUTS_FIELD: JsonSchema = {
  type: "object",
  description:
    "Values for the node's input handles, keyed by handle name. A handle " +
    "the node reads as a stream also accepts an array, which is fed to it " +
    "one item at a time; a live guest-produced stream is not supported.",
  additionalProperties: true
};

export const INVOKE_NODE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    type: TYPE_FIELD,
    inputs: INPUTS_FIELD,
    secrets: {
      type: "array",
      description:
        "Secret names this node may read. Omit to leave the invoking run's " +
        "own reach unchanged; a list can only narrow it, never widen it.",
      items: { type: "string" }
    }
  },
  required: ["type"]
};

export const OPEN_NODE_STREAM_SCHEMA: JsonSchema = {
  type: "object",
  properties: { type: TYPE_FIELD, inputs: INPUTS_FIELD },
  required: ["type"]
};

export const TAKE_NODE_STREAM_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    stream_id: {
      type: "string",
      description: "The id open_node_stream returned."
    }
  },
  required: ["stream_id"]
};

export const CLOSE_NODE_STREAM_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    stream_id: {
      type: "string",
      description: "The id open_node_stream returned."
    }
  },
  required: ["stream_id"]
};

export const invokeNodeSpec: CapabilitySpec = {
  name: "invoke_node",
  description:
    "Run one registry node and return its outputs, keyed by output handle. " +
    "The node runs on the invoking run's own context, so its cost, secrets " +
    "and storage are the caller's. A node that yields several records is " +
    "drained and folded to the last value per handle — use " +
    "open_node_stream to read the items themselves. An unknown node type " +
    "is an error, not an empty result.",
  inputSchema: INVOKE_NODE_SCHEMA,
  category: "execute",
  userMessage: (params) => `Running node ${String(params["type"] ?? "")}`
};

export const openNodeStreamSpec: CapabilitySpec = {
  name: "open_node_stream",
  description:
    "Start a node and read its output item by item instead of waiting for " +
    "the whole thing. Returns {stream_id}; read with take_node_stream and " +
    "always finish with close_node_stream, which runs the node's own " +
    "cleanup. At most " +
    String(MAX_OPEN_NODE_STREAMS) +
    " streams may be open at once.",
  inputSchema: OPEN_NODE_STREAM_SCHEMA,
  category: "execute",
  userMessage: (params) => `Streaming node ${String(params["type"] ?? "")}`
};

export const takeNodeStreamSpec: CapabilitySpec = {
  name: "take_node_stream",
  description:
    "Take the next item from an open node stream: {done: true} at the end, " +
    "else {done: false, value}. `value` is one record of output handles for " +
    "a generator node, or one {slot, value} emission for a node written " +
    "against the streaming-input contract. Two takes cannot be in flight on " +
    "one stream at once.",
  inputSchema: TAKE_NODE_STREAM_SCHEMA,
  category: "read",
  userMessage: () => "Reading a node stream"
};

export const closeNodeStreamSpec: CapabilitySpec = {
  name: "close_node_stream",
  description:
    "Close an open node stream and run the node's cleanup. Closing a stream " +
    "that already ended is not an error.",
  inputSchema: CLOSE_NODE_STREAM_SCHEMA,
  category: "read",
  userMessage: () => "Closing a node stream"
};

/** Every spec this module declares, in declaration order. */
export const flowSpecs: readonly CapabilitySpec[] = [
  invokeNodeSpec,
  openNodeStreamSpec,
  takeNodeStreamSpec,
  closeNodeStreamSpec
];
