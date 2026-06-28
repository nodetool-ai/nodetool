/**
 * Memory tools — progressive disclosure access to the shared agent memory.
 *
 * Earlier versions auto-injected every memory entry into every step's user
 * message. That worked but was wasteful: large upstream results bloated every
 * downstream prompt even when the step only needed one specific entry.
 *
 * The 2026 pattern is **progressive disclosure**: the model receives a tiny
 * "what's available" hint up front and pulls full values on demand:
 *
 *   1. `memory_list` — returns metadata for all entries (key, kind, title,
 *      description, source, byte size). No values. Cheap to call.
 *   2. `memory_read` — returns full values for a list of keys.
 *   3. `memory_write` — publishes a value to the `shared:` namespace so other
 *      agents and steps can discover it via `memory_list`.
 *
 * These three tools are auto-attached to every {@link StepExecutor}. Authors
 * of custom executors should call `getMemoryTools()` and append the result to
 * their tool array.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { MemoryEntry, MemoryKind } from "@nodetool-ai/runtime";
import { memoryKeys } from "@nodetool-ai/runtime";
import { Tool } from "./base-tool.js";

/** Maximum bytes of `description` returned per entry from memory_list. */
const MAX_DESCRIPTION_CHARS = 240;

/** Hard upper bound on entries returned in a single memory_list call. */
const MAX_LIST_ENTRIES = 200;

interface MemoryListEntry {
  key: string;
  kind: MemoryKind;
  title?: string;
  description?: string;
  source?: string;
  /** Approximate size of the value when JSON-serialized (in characters). */
  valueBytes: number;
  /** ISO timestamp when the entry was first written. */
  createdAt: string;
}

function describeEntry(entry: MemoryEntry): MemoryListEntry {
  const serialized =
    typeof entry.value === "string"
      ? entry.value
      : (() => {
          try {
            return JSON.stringify(entry.value);
          } catch {
            return String(entry.value);
          }
        })();
  return {
    key: entry.key,
    kind: entry.kind,
    title: entry.title,
    description:
      entry.description && entry.description.length > MAX_DESCRIPTION_CHARS
        ? entry.description.slice(0, MAX_DESCRIPTION_CHARS) + "…"
        : entry.description,
    source: entry.source,
    valueBytes: serialized.length,
    createdAt: new Date(entry.createdAt).toISOString()
  };
}

/**
 * `memory_list` — discover what's in shared agent memory. Returns metadata
 * only (no values). Filter by kind, key prefix, or producer source.
 */
export class MemoryListTool extends Tool {
  readonly name = "memory_list";
  readonly description =
    "List entries in shared agent memory (results from prior steps and tasks, " +
    "inputs, and shared facts published by other agents). Returns metadata " +
    "only — call `memory_read` to fetch full values. Use this when you need " +
    "context from upstream work but don't yet know which entry holds it.";

  readonly jsonSchema: Record<string, unknown> = {
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
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const kindFilter = Array.isArray(params.kind)
      ? (params.kind as MemoryKind[])
      : undefined;
    const keyPrefix =
      typeof params.key_prefix === "string"
        ? (params.key_prefix as string)
        : undefined;
    const sources = Array.isArray(params.sources)
      ? (params.sources as string[])
      : undefined;

    const entries = context.memory.list({
      kind: kindFilter,
      keyPrefix,
      sources
    });
    const truncated = entries.length > MAX_LIST_ENTRIES;
    const sliced = truncated ? entries.slice(0, MAX_LIST_ENTRIES) : entries;
    return {
      total: entries.length,
      returned: sliced.length,
      truncated,
      entries: sliced.map(describeEntry)
    };
  }

  userMessage(params: Record<string, unknown>): string {
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
}

/**
 * `memory_read` — fetch full values for one or more memory keys.
 *
 * The response maps each requested key to its full entry. Missing keys are
 * reported in `missing` so the agent can decide whether to retry or proceed.
 */
export class MemoryReadTool extends Tool {
  readonly name = "memory_read";
  readonly description =
    "Read full values from shared agent memory by key. Use the keys returned " +
    "by `memory_list`. Returns each requested entry with its value, kind, " +
    "title, and source. Missing keys are reported in `missing`.";

  readonly jsonSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      keys: {
        type: "array",
        items: { type: "string" },
        description:
          "Memory keys to read (e.g. [\"task:research\", \"step:summary\"])."
      }
    },
    required: ["keys"],
    additionalProperties: false
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const keys = Array.isArray(params.keys)
      ? (params.keys as unknown[]).map(String)
      : [];

    const found: Record<string, MemoryEntry> = {};
    const missing: string[] = [];
    for (const key of keys) {
      const entry = context.memory.get(key);
      if (entry) {
        found[key] = entry;
      } else {
        missing.push(key);
      }
    }

    return { entries: found, missing };
  }

  userMessage(params: Record<string, unknown>): string {
    const keys = Array.isArray(params.keys)
      ? (params.keys as unknown[]).map(String)
      : [];
    if (keys.length === 0) return "Reading memory";
    if (keys.length === 1) return `Reading memory: ${keys[0]}`;
    return `Reading memory: ${keys.length} entries`;
  }
}

/**
 * `memory_write` — publish a value to the `shared:` namespace so other agents
 * and steps can discover it via `memory_list`.
 *
 * Writes are restricted to `shared:` keys to prevent agents from spoofing
 * step / task / input results. The `key` argument is the suffix after
 * `shared:` and is passed through `memoryKeys.shared()`.
 */
export class MemoryWriteTool extends Tool {
  readonly name = "memory_write";
  readonly description =
    "Publish a value to shared agent memory under the `shared:` namespace. " +
    "Other agents and downstream steps can discover it via `memory_list` and " +
    "fetch it via `memory_read`. Use this to broadcast facts, intermediate " +
    "findings, or coordination signals to the rest of the team.";

  readonly jsonSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      key: {
        type: "string",
        minLength: 1,
        description:
          "Suffix for the memory key. Stored as `shared:<key>`. Use a short, " +
          "descriptive identifier (e.g. \"top_sources\")."
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
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const suffix = String(params.key);
    const fullKey = memoryKeys.shared(suffix);
    const entry = context.memory.set({
      key: fullKey,
      kind: "shared",
      value: params.value,
      title: typeof params.title === "string" ? params.title : suffix,
      description:
        typeof params.description === "string" ? params.description : undefined,
      source: "memory_write"
    });
    return {
      ok: true,
      key: entry.key,
      kind: entry.kind,
      createdAt: new Date(entry.createdAt).toISOString()
    };
  }

  userMessage(params: Record<string, unknown>): string {
    const key = typeof params.key === "string" ? params.key : "(no key)";
    return `Publishing to memory: shared:${key}`;
  }
}

/**
 * Returns fresh instances of the three memory tools. Call this once per
 * executor — every executor needs its own instances so they don't share
 * mutable state (none currently exists, but this future-proofs).
 */
export function getMemoryTools(): Tool[] {
  return [new MemoryListTool(), new MemoryReadTool(), new MemoryWriteTool()];
}

/** Names of the auto-attached memory tools. Useful for filtering / detection. */
export const MEMORY_TOOL_NAMES = [
  "memory_list",
  "memory_read",
  "memory_write"
] as const;
