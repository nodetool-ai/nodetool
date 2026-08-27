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

export const THREAD_SCOPE_SCHEMA = {
  type: "string" as const,
  enum: ["all", "current"],
  description:
    "Which conversation's memories to read. 'all' (the default) reads every " +
    "memory you have ever saved, in any conversation. 'current' narrows to " +
    "the ones recorded in this conversation."
};

export const memorySaveSpec: CapabilitySpec = {
  name: "memory_save",
  description:
    "Save a durable memory. Use it to remember project facts, user " +
    "preferences, decisions, and — crucially — the resources you produce or " +
    "rely on (pass them in `resources`: the assets you generate, a workflow " +
    "you built, a collection, a URL) so you can reuse them later. Memories " +
    "are yours across every conversation, not just this one: what you save " +
    "here you can read back in any later thread. The current conversation's " +
    "memories are shown back to you at the start of each turn; reach the rest " +
    "with memory_search or memory_list.",
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

export const memoryListSpec: CapabilitySpec = {
  name: "memory_list",
  description:
    "List your durable memories, newest first, across every conversation. " +
    "Each carries its referenced resources resolved (asset references carry a " +
    "live asset:// uri you can pass to view_image or reuse in generation " +
    "tools). Use memory_search instead when you know what you are looking for.",
  inputSchema: {
    type: "object",
    properties: {
      limit: {
        type: "number",
        description: "Maximum memories to return (default 100, max 200)."
      },
      thread: THREAD_SCOPE_SCHEMA,
      kinds: {
        type: "array",
        items: KIND_SCHEMA,
        description: "Only these kinds. Omit for every kind."
      }
    },
    required: []
  },
  category: "read",
  userMessage: () => "Recalling memory"
};

export const memorySearchSpec: CapabilitySpec = {
  name: "memory_search",
  description:
    "Search your durable memories by keyword, across every conversation. " +
    "Every word you pass must appear in a memory's title or content, matched " +
    "case-insensitively, so fewer words find more. Use it to recall what you " +
    "learned in an earlier conversation — e.g. 'palette' or 'hero image'. " +
    "Results are newest first with their resources resolved.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Words to look for, separated by spaces (e.g. 'brand colour'). " +
          "A memory matches only when it contains all of them."
      },
      limit: {
        type: "number",
        description: "Maximum matches to return (default 25, max 200)."
      },
      thread: THREAD_SCOPE_SCHEMA,
      kinds: {
        type: "array",
        items: KIND_SCHEMA,
        description: "Only search these kinds. Omit for every kind."
      }
    },
    required: ["query"]
  },
  category: "read",
  userMessage: (params) => {
    const query = isString(params.query) ? params.query.trim() : "";
    return query
      ? `Searching memory for "${query.slice(0, 40)}"`
      : "Searching memory";
  }
};

export const memoryUpdateSpec: CapabilitySpec = {
  name: "memory_update",
  description:
    "Update one of your memories by id, whichever conversation it was saved " +
    "in. Only the fields you pass are changed; pass `resources` to replace " +
    "the referenced resources.",
  inputSchema: {
    type: "object",
    properties: {
      memory_id: {
        type: "string",
        description:
          "Id of the memory to update (from memory_list or memory_search)."
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

export const memoryDeleteSpec: CapabilitySpec = {
  name: "memory_delete",
  description:
    "Delete one of your memories by id, whichever conversation it was saved " +
    "in, when it is no longer relevant or was superseded.",
  inputSchema: {
    type: "object",
    properties: {
      memory_id: {
        type: "string",
        description:
          "Id of the memory to delete (from memory_list or memory_search)."
      }
    },
    required: ["memory_id"]
  },
  category: "write",
  userMessage: () => "Forgetting a memory"
};

/** Every spec this module declares, in declaration order. */
export const memorySpecs: readonly CapabilitySpec[] = [
  memorySaveSpec,
  memoryListSpec,
  memorySearchSpec,
  memoryUpdateSpec,
  memoryDeleteSpec
];
