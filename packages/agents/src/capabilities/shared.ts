/**
 * The `shared` capability module — run-scoped agent memory.
 *
 * Three capabilities that used to be three `Tool` subclasses in
 * `../tools/memory-tools.ts`, which now assembles them from these specs.
 * Wire names, descriptions, schemas and behaviour are unchanged.
 *
 * Separate from `memory` on purpose: that module is thread memory, which
 * outlives the run and lives in the database. These read and write
 * `run.context.memory` — the `AgentMemory` a run carries and discards. The
 * naming says the lifetimes: `nodetool.shared` run-scoped beside
 * `nodetool.memory` thread-scoped.
 *
 * Mount policy stays with the executors. `getMemoryTools()` builds a belt from
 * these specs, and every step executor pushes that belt onto its own toolset —
 * the host never mounts these.
 *
 * Earlier versions auto-injected every memory entry into every step's user
 * message. That was wasteful: a large upstream result bloated every downstream
 * prompt even when the step needed one entry. The pattern here is progressive
 * disclosure — `list_shared` returns metadata, `read_shared` returns the values
 * the model asks for, and `share_result` publishes into the `shared:`
 * namespace.
 *
 * Design: docs/tool-class-retirement-design.md § "The `shared` module".
 */

import type { MemoryEntry, MemoryKind } from "@nodetool-ai/runtime";
import { memoryKeys } from "@nodetool-ai/runtime";
import type { CapabilityExport, CapabilityModule } from "./types.js";
import {
  listSharedSpec,
  readSharedSpec,
  shareResultSpec
} from "./shared.specs.js";
import { isString } from "../utils/type-guards.js";

/** Maximum bytes of `description` returned per entry from list_shared. */
const MAX_DESCRIPTION_CHARS = 240;

/** Hard upper bound on entries returned in a single list_shared call. */
const MAX_LIST_ENTRIES = 200;

/**
 * Normalize the key argument of `share_result`, which takes the suffix after
 * `shared:` while `read_shared` and `list_shared` deal in full keys. A model
 * that hands a full key back to the write side minted `shared:shared:<key>` —
 * observed in a live run. Stripping the prefix makes the write idempotent
 * under a round trip through either read tool.
 *
 * The cost is that a literal key `shared:shared:x` can no longer be created.
 * Nothing wants one, and the tool description says the prefix is optional.
 */
function sharedSuffix(key: string): string {
  return key.startsWith("shared:") ? key.slice("shared:".length) : key;
}

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
    isString(entry.value)
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

// ---------------------------------------------------------------------------
// list_shared
// ---------------------------------------------------------------------------

const listShared: CapabilityExport = {
  spec: listSharedSpec,
  impl: async (run, params) => {
    const kindFilter = Array.isArray(params.kind)
      ? (params.kind as MemoryKind[])
      : undefined;
    const keyPrefix =
      isString(params.key_prefix)
        ? params.key_prefix
        : undefined;
    const sources = Array.isArray(params.sources)
      ? (params.sources as string[])
      : undefined;

    const entries = run.context.memory.list({
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
};

// ---------------------------------------------------------------------------
// read_shared
// ---------------------------------------------------------------------------

const readShared: CapabilityExport = {
  spec: readSharedSpec,
  impl: async (run, params) => {
    const keys = Array.isArray(params.keys)
      ? (params.keys as unknown[]).map(String)
      : [];

    const found: Record<string, MemoryEntry> = {};
    const missing: string[] = [];
    for (const key of keys) {
      // A bare suffix is what `share_result` accepts, so a model that reads
      // back what it just wrote often asks for one. Retry the miss under the
      // `shared:` namespace before reporting it, and report under the key that
      // was asked for either way.
      const entry =
        run.context.memory.get(key) ??
        (key.includes(":")
          ? undefined
          : run.context.memory.get(memoryKeys.shared(key)));
      if (entry) {
        found[key] = entry;
      } else {
        missing.push(key);
      }
    }

    return { entries: found, missing };
  }
};

// ---------------------------------------------------------------------------
// share_result
// ---------------------------------------------------------------------------

const shareResult: CapabilityExport = {
  spec: shareResultSpec,
  impl: async (run, params) => {
    const suffix = sharedSuffix(String(params.key));
    const fullKey = memoryKeys.shared(suffix);
    const entry = run.context.memory.set({
      key: fullKey,
      kind: "shared",
      value: params.value,
      title: isString(params.title) ? params.title : suffix,
      description:
        isString(params.description) ? params.description : undefined,
      source: "share_result"
    });
    return {
      ok: true,
      key: entry.key,
      kind: entry.kind,
      createdAt: new Date(entry.createdAt).toISOString()
    };
  }
};

/** Every shared-memory capability, in the order memory-tools.ts declared them. */
export const SHARED_CAPABILITIES: readonly CapabilityExport[] = [
  listShared,
  readShared,
  shareResult
];

export const module: CapabilityModule = {
  module: "shared",
  exports: SHARED_CAPABILITIES
};

export { listShared, readShared, shareResult };
