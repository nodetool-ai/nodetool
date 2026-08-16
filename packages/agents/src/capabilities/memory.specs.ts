/**
 * The `memory` module's specs — data only, no implementation.
 *
 * Split out so a belt can be assembled synchronously: the registry's eager
 * spec table imports this file, never `memory.ts`, so nothing the
 * implementations pull in reaches the entry graph. `memory.ts` imports these
 * back and attaches each to its implementation, so there is one spec object
 * behind both halves.
 */

import type { CapabilitySpec } from "./types.js";
import { isString } from "../utils/type-guards.js";

export const KNOWN_RESOURCE_TYPES = [
  "asset",
  "workflow",
  "collection",
  "node",
  "job",
  "timeline",
  "script",
  "storyboard",
  "image_document",
  "thread",
  "url",
  "other"
];

export const KIND_SCHEMA = {
  type: "string" as const,
  enum: ["note", "fact", "preference", "decision", "resource"],
  description:
    "Category of the memory. Use 'resource' when the point is the referenced " +
    "resource(s), 'preference'/'decision'/'fact' for durable project context, " +
    "else 'note'. Defaults to 'note'."
};

export const RESOURCES_SCHEMA = {
  type: "array" as const,
  items: {
    type: "object" as const,
    properties: {
      type: {
        type: "string" as const,
        description:
          "Resource kind — one of: " +
          KNOWN_RESOURCE_TYPES.join(", ") +
          ". Any other value is allowed too."
      },
      id: {
        type: "string" as const,
        description:
          "Identifier: asset id, workflow id, collection name, node type, a URL, etc."
      },
      uri: {
        type: "string" as const,
        description: "Optional canonical uri (asset://…, https://…)."
      },
      label: { type: "string" as const, description: "Optional human label." }
    },
    required: ["type", "id"]
  },
  description:
    "Typed references to resources this memory is about — the assets you " +
    "generated (type 'asset'), a workflow you built ('workflow'), a collection, " +
    "a URL, etc. — so you can find and reuse them later. Asset references are " +
    "validated and resolved to their asset:// uri; other kinds are stored as-is."
};

export const threadMemorySaveSpec: CapabilitySpec = {
  name: "thread_memory_save",
  description:
    "Save a durable memory to the current conversation. Use it to remember " +
    "project facts, user preferences, decisions, and — crucially — the " +
    "resources you produce or rely on (pass them in `resources`: the assets " +
    "you generate, a workflow you built, a collection, a URL) so you can reuse " +
    "them later. Memories persist across turns and are shown back to you at " +
    "the start of each turn.",
  inputSchema: {
    type: "object",
    properties: {
      content: {
        type: "string",
        description:
          "The memory itself — a self-contained note (e.g. 'The hero image " +
          "uses a teal/orange palette the user approved')."
      },
      title: {
        type: "string",
        description: "Optional short label shown when memories are listed."
      },
      kind: KIND_SCHEMA,
      resources: RESOURCES_SCHEMA
    },
    required: ["content"]
  },
  category: "write",
  userMessage: (params) => {
    const title = isString(params.title) ? params.title : "";
    return title ? `Remembering: ${title.slice(0, 60)}` : "Saving to memory";
  }
};

export const threadMemoryListSpec: CapabilitySpec = {
  name: "thread_memory_list",
  description:
    "List the durable memories saved for the current conversation, newest " +
    "first, each with its referenced resources resolved (asset references " +
    "carry a live asset:// uri you can pass to view_image or reuse in " +
    "generation tools).",
  inputSchema: {
    type: "object",
    properties: {
      limit: {
        type: "number",
        description: "Maximum memories to return (default 100, max 200)."
      }
    },
    required: []
  },
  category: "read",
  userMessage: () => "Recalling conversation memory"
};

export const threadMemoryUpdateSpec: CapabilitySpec = {
  name: "thread_memory_update",
  description:
    "Update a memory in the current conversation by id. Only the fields you " +
    "pass are changed; pass `resources` to replace the referenced resources.",
  inputSchema: {
    type: "object",
    properties: {
      memory_id: {
        type: "string",
        description: "Id of the memory to update (from thread_memory_list)."
      },
      content: { type: "string", description: "New content text." },
      title: { type: "string", description: "New title." },
      kind: KIND_SCHEMA,
      resources: RESOURCES_SCHEMA
    },
    required: ["memory_id"]
  },
  category: "write",
  userMessage: () => "Updating conversation memory"
};

export const threadMemoryDeleteSpec: CapabilitySpec = {
  name: "thread_memory_delete",
  description:
    "Delete a memory from the current conversation by id when it's no longer " +
    "relevant or was superseded.",
  inputSchema: {
    type: "object",
    properties: {
      memory_id: {
        type: "string",
        description: "Id of the memory to delete (from thread_memory_list)."
      }
    },
    required: ["memory_id"]
  },
  category: "write",
  userMessage: () => "Forgetting a memory"
};

/** Every spec this module declares, in declaration order. */
export const memorySpecs: readonly CapabilitySpec[] = [
  threadMemorySaveSpec,
  threadMemoryListSpec,
  threadMemoryUpdateSpec,
  threadMemoryDeleteSpec
];
