/**
 * Long-term memory tools — explicit recall and remember operations agents
 * can call when they want fine-grained control over what gets persisted or
 * what context they pull in.
 *
 * These are distinct from the in-session `memory_list` / `memory_read` /
 * `memory_write` tools (`./memory-tools.ts`), which operate on the
 * per-context {@link AgentMemory} that lives only for the duration of a
 * single agent run. The LTM tools persist through the configured
 * {@link VectorProvider} (sqlite-vec by default, Pinecone or Supabase when
 * `NODETOOL_VECTOR_PROVIDER` is set), so memories survive across runs.
 *
 * Two ways to wire them up:
 *
 *   1. **Per-tool binding** — pass a {@link LongTermMemory} to the
 *      constructor. Useful when an agent should only see its own scope.
 *
 *   2. **Per-user registry** — call {@link setLongTermMemory} once at
 *      session start with the user's LTM, then construct the tools without
 *      arguments. They look up the LTM by `context.userId` at call time.
 *      This is what {@link processChat} and {@link Agent} use under the
 *      hood, so the same tools work in both surfaces.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import { Tool } from "./base-tool.js";
import { LongTermMemory } from "../long-term-memory.js";
import type { MemoryKind } from "../long-term-memory.js";

// ---------------------------------------------------------------------------
// Per-user registry
// ---------------------------------------------------------------------------

const REGISTRY = new Map<string, LongTermMemory>();

/**
 * Register a {@link LongTermMemory} for a user so the LTM tools can find it
 * via `context.userId` without having to thread the instance everywhere.
 */
export function setLongTermMemory(
  userId: string,
  memory: LongTermMemory | null
): void {
  if (!userId) return;
  if (memory === null) REGISTRY.delete(userId);
  else REGISTRY.set(userId, memory);
}

/** Look up a previously registered LTM. Returns null if none is set. */
export function getLongTermMemory(userId: string): LongTermMemory | null {
  if (!userId) return null;
  return REGISTRY.get(userId) ?? null;
}

function resolveMemory(
  bound: LongTermMemory | null,
  context: ProcessingContext
): LongTermMemory | null {
  if (bound) return bound;
  return getLongTermMemory(context.userId);
}

// ---------------------------------------------------------------------------
// ltm_recall
// ---------------------------------------------------------------------------

export class LtmRecallTool extends Tool {
  readonly name = "ltm_recall";
  readonly description =
    "Retrieve durable memories about the user, their projects, preferences " +
    "and prior decisions that are relevant to a query. Memories persist " +
    "across sessions. Returns up to `k` items, ranked by a hybrid of " +
    "semantic similarity, recency and importance.";

  readonly inputSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Natural-language query describing what context you need (e.g. " +
          "\"user's preferred testing framework\")."
      },
      k: {
        type: "number",
        minimum: 1,
        maximum: 20,
        description: "Maximum items to return (default 5)."
      }
    },
    required: ["query"],
    additionalProperties: false
  };

  constructor(private readonly bound: LongTermMemory | null = null) {
    super();
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const memory = resolveMemory(this.bound, context);
    if (!memory) {
      return { items: [], note: "Long-term memory is not configured." };
    }
    const query = typeof params.query === "string" ? params.query : "";
    const k =
      typeof params.k === "number" && Number.isFinite(params.k)
        ? Math.max(1, Math.min(20, Math.trunc(params.k)))
        : undefined;
    const items = await memory.recall(query, k ? { k } : {});
    return {
      items: items.map((it) => ({
        id: it.id,
        text: it.text,
        kind: it.kind,
        importance: it.importance,
        score: it.score,
        createdAt: new Date(it.createdAt).toISOString()
      }))
    };
  }

  override userMessage(params: Record<string, unknown>): string {
    const q = typeof params.query === "string" ? params.query : "";
    return q ? `Recalling memory: ${q.slice(0, 60)}` : "Recalling memory";
  }
}

// ---------------------------------------------------------------------------
// ltm_remember
// ---------------------------------------------------------------------------

export class LtmRememberTool extends Tool {
  readonly name = "ltm_remember";
  readonly description =
    "Persist a single durable memory about the user (a fact, preference, " +
    "decision or notable event) so it can be recalled in future sessions. " +
    "Each memory should be one self-contained sentence. Near-duplicates of " +
    "existing memories are skipped automatically.";

  readonly inputSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      text: {
        type: "string",
        minLength: 1,
        description:
          "The memory itself — one self-contained sentence (e.g. \"User " +
          "prefers TypeScript over JavaScript for new code.\")."
      },
      kind: {
        type: "string",
        enum: ["fact", "preference", "decision", "event"],
        description: "Memory category. Defaults to \"fact\"."
      },
      importance: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description:
          "How relevant this memory is in general. 1 = always relevant, " +
          "0.3 = niche. Defaults to 0.5."
      }
    },
    required: ["text"],
    additionalProperties: false
  };

  constructor(private readonly bound: LongTermMemory | null = null) {
    super();
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const memory = resolveMemory(this.bound, context);
    if (!memory) {
      return { stored: false, note: "Long-term memory is not configured." };
    }
    const text = typeof params.text === "string" ? params.text : "";
    if (!text.trim()) {
      return { stored: false, note: "text is required" };
    }
    const kind =
      typeof params.kind === "string"
        ? (params.kind as MemoryKind)
        : undefined;
    const importance =
      typeof params.importance === "number" ? params.importance : undefined;
    const stored = await memory.remember(text, {
      kind,
      importance,
      source: "ltm_remember"
    });
    if (!stored) {
      return { stored: false, note: "Skipped as duplicate of existing memory." };
    }
    return {
      stored: true,
      id: stored.id,
      kind: stored.kind,
      importance: stored.importance
    };
  }

  override userMessage(params: Record<string, unknown>): string {
    const text = typeof params.text === "string" ? params.text : "";
    return text
      ? `Remembering: ${text.slice(0, 60)}`
      : "Storing long-term memory";
  }
}

/** Returns fresh instances of the LTM tools, optionally bound to an LTM. */
export function getLongTermMemoryTools(
  memory: LongTermMemory | null = null
): Tool[] {
  return [new LtmRecallTool(memory), new LtmRememberTool(memory)];
}

/** Names of the LTM tools. */
export const LTM_TOOL_NAMES = ["ltm_recall", "ltm_remember"] as const;
