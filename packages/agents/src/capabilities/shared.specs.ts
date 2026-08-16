/**
 * The `shared` module's specs — data only, no implementation.
 *
 * Split out so a belt can be assembled synchronously: the registry's eager
 * spec table imports this file, never `shared.ts`, so nothing the
 * implementations pull in reaches the entry graph. `shared.ts` imports these
 * back and attaches each to its implementation, so there is one spec object
 * behind both halves.
 *
 * Wire names, descriptions and schemas are the ones the three `Tool`
 * subclasses in `../tools/memory-tools.ts` carried, unchanged.
 */

import type { CapabilitySpec } from "./types.js";
import { isString } from "../utils/type-guards.js";

export const listSharedSpec: CapabilitySpec = {
  name: "list_shared",
  description:
    "List entries in shared agent memory (results from prior steps and tasks, " +
    "inputs, and shared facts published by other agents). Returns metadata " +
    "only — call `read_shared` to fetch full values. Use this when you need " +
    "context from upstream work but don't yet know which entry holds it.",
  inputSchema: {
    type: "object",
    properties: {
      kind: {
        type: "array",
        items: {
          type: "string",
          enum: ["task_result", "step_result", "input", "shared"]
        },
        description:
          "Optional filter — restrict results to the listed kinds. Omit to list everything."
      },
      key_prefix: {
        type: "string",
        description:
          "Optional filter — only entries whose key starts with this prefix (e.g. \"task:\")."
      },
      sources: {
        type: "array",
        items: { type: "string" },
        description:
          "Optional filter — only entries produced by one of these source IDs."
      }
    },
    additionalProperties: false
  },
  category: "read",
  userMessage: (params) => {
    const parts: string[] = [];
    if (Array.isArray(params.kind))
      parts.push(`kinds=${(params.kind as string[]).join(",")}`);
    if (params.key_prefix) parts.push(`prefix=${params.key_prefix}`);
    if (Array.isArray(params.sources))
      parts.push(`sources=${(params.sources as string[]).join(",")}`);
    return parts.length > 0
      ? `Listing memory (${parts.join(" ")})`
      : "Listing memory";
  }
};

export const readSharedSpec: CapabilitySpec = {
  name: "read_shared",
  description:
    "Read full values from shared agent memory by key. Use the keys returned " +
    "by `list_shared`. Returns each requested entry with its value, kind, " +
    "title, and source. Missing keys are reported in `missing`.",
  inputSchema: {
    type: "object",
    properties: {
      keys: {
        type: "array",
        items: { type: "string" },
        description:
          "Memory keys to read (e.g. [\"task:research\", \"step:summary\"]). " +
          "A key with no `<namespace>:` prefix is also looked up under " +
          "`shared:`, so a suffix passed to `share_result` reads back as-is."
      }
    },
    required: ["keys"],
    additionalProperties: false
  },
  category: "read",
  userMessage: (params) => {
    const keys = Array.isArray(params.keys)
      ? (params.keys as unknown[]).map(String)
      : [];
    if (keys.length === 0) return "Reading memory";
    if (keys.length === 1) return `Reading memory: ${keys[0]}`;
    return `Reading memory: ${keys.length} entries`;
  }
};

export const shareResultSpec: CapabilitySpec = {
  name: "share_result",
  description:
    "Publish a value to shared agent memory under the `shared:` namespace. " +
    "Other agents and downstream steps can discover it via `list_shared` and " +
    "fetch it via `read_shared`. Use this to broadcast facts, intermediate " +
    "findings, or coordination signals to the rest of the team. Shared memory " +
    "lives only for the current run — to keep something past it, use " +
    "`thread_memory_save` instead.",
  inputSchema: {
    type: "object",
    properties: {
      key: {
        type: "string",
        minLength: 1,
        description:
          "Suffix for the memory key. Stored as `shared:<key>`. Use a short, " +
          "descriptive identifier (e.g. \"top_sources\"). A leading " +
          "`shared:` is optional and stripped, so passing a key straight " +
          "back from `list_shared` writes the same entry."
      },
      value: {
        description:
          "The value to publish. Any JSON-serializable structure or string."
      },
      title: {
        type: "string",
        description:
          "Optional human-readable title shown when the entry is listed."
      },
      description: {
        type: "string",
        description: "Optional brief description shown alongside the title."
      }
    },
    required: ["key", "value"],
    additionalProperties: false
  },
  category: "read",
  userMessage: (params) => {
    const key = isString(params.key) ? params.key : "(no key)";
    return `Publishing to memory: shared:${key}`;
  }
};

/** Every spec this module declares, in declaration order. */
export const sharedSpecs: readonly CapabilitySpec[] = [
  listSharedSpec,
  readSharedSpec,
  shareResultSpec
];
