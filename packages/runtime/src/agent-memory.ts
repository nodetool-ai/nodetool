/**
 * AgentMemory — unified, structured key/value store for agent results.
 *
 * One memory instance lives on every {@link ProcessingContext}. It is the
 * single source of truth for everything that flows between agents, tasks and
 * steps:
 *
 *   - **inputs** seeded by the caller
 *   - **step_result** entries written by {@link StepExecutor}
 *   - **task_result** entries written by {@link StepExecutor} for finish-task
 *     steps and by {@link ParallelTaskExecutor} when a task completes
 *   - **shared** entries written by tools or by the user for cross-agent
 *     communication
 *
 * Keys use namespaced prefixes (`step:`, `task:`, `input:`, `shared:`) so the
 * different kinds never collide. The {@link AgentMemory.formatForPrompt}
 * helper renders selected entries as a Markdown block ready to inject into a
 * user/system prompt — the canonical way agents discover prior results.
 *
 * Design goals (2026 agent patterns):
 *
 *   - **Single store, single API**: no parallel maps in executors.
 *   - **Discoverable**: every step/task/sub-agent can list and read all
 *     prior results via the same calls.
 *   - **Structured**: entries carry kind, source, title and description so
 *     prompts render consistently.
 *   - **Reactive**: subscribers can react to writes.
 */

export type MemoryKind = "task_result" | "step_result" | "input" | "shared";

export interface MemoryEntry {
  /** Globally unique key. Use {@link memoryKeys} for canonical namespacing. */
  key: string;
  /** Categorization used for filtering and prompt rendering. */
  kind: MemoryKind;
  /** Stored value (any JSON-serializable structure). */
  value: unknown;
  /** Optional ID of the producer (task / step / agent / tool). */
  source?: string;
  /** Optional human-readable title used as the heading in prompt rendering. */
  title?: string;
  /** Optional brief description rendered alongside the title. */
  description?: string;
  /** Wall-clock ms when the entry was first written. */
  createdAt: number;
}

export interface MemoryFilter {
  /** One or more kinds to include. Omit to include all kinds. */
  kind?: MemoryKind | MemoryKind[];
  /** Only include entries whose key is in this list. */
  keys?: string[];
  /** Only include entries whose key starts with this prefix. */
  keyPrefix?: string;
  /** Only include entries whose source matches one of these IDs. */
  sources?: string[];
}

export type MemoryListener = (entry: MemoryEntry) => void;

/**
 * Canonical key builders. Every namespace has its own helper so callers
 * never invent free-form keys that drift between writers and readers.
 */
export const memoryKeys = {
  step: (id: string): string => `step:${id}`,
  task: (id: string): string => `task:${id}`,
  input: (key: string): string => `input:${key}`,
  shared: (key: string): string => `shared:${key}`
} as const;

export class AgentMemory {
  private readonly entries = new Map<string, MemoryEntry>();
  private readonly listeners = new Set<MemoryListener>();

  /**
   * Write an entry. If a value already exists for {@link MemoryEntry.key} it
   * is overwritten. The original `createdAt` is preserved unless the caller
   * supplies a new one.
   */
  set(input: Omit<MemoryEntry, "createdAt"> & { createdAt?: number }): MemoryEntry {
    const existing = this.entries.get(input.key);
    const entry: MemoryEntry = {
      key: input.key,
      kind: input.kind,
      value: input.value,
      source: input.source,
      title: input.title,
      description: input.description,
      createdAt: input.createdAt ?? existing?.createdAt ?? Date.now()
    };
    this.entries.set(entry.key, entry);
    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch (error) {
        console.error("AgentMemory listener failed", {
          key: entry.key,
          error
        });
      }
    }
    return entry;
  }

  /** Get the full entry, or undefined if no such key. */
  get(key: string): MemoryEntry | undefined {
    return this.entries.get(key);
  }

  /** Get just the stored value, or undefined if no such key. */
  getValue<T = unknown>(key: string): T | undefined {
    return this.entries.get(key)?.value as T | undefined;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  delete(key: string): boolean {
    return this.entries.delete(key);
  }

  size(): number {
    return this.entries.size;
  }

  /** List entries matching an optional filter, in insertion order. */
  list(filter?: MemoryFilter): MemoryEntry[] {
    if (!filter) return [...this.entries.values()];

    const kindArr =
      filter.kind === undefined
        ? null
        : Array.isArray(filter.kind)
          ? filter.kind
          : [filter.kind];
    const keysSet = filter.keys ? new Set(filter.keys) : null;
    const sourcesSet = filter.sources ? new Set(filter.sources) : null;

    const out: MemoryEntry[] = [];
    for (const entry of this.entries.values()) {
      if (kindArr && !kindArr.includes(entry.kind)) continue;
      if (keysSet && !keysSet.has(entry.key)) continue;
      if (filter.keyPrefix && !entry.key.startsWith(filter.keyPrefix)) continue;
      if (sourcesSet && (!entry.source || !sourcesSet.has(entry.source))) continue;
      out.push(entry);
    }
    return out;
  }

  /**
   * Render selected entries as a Markdown block suitable for injection into
   * a user/system prompt. Returns an empty string when no entries match.
   *
   * Each entry is rendered as:
   *
   *     ## [kind] title (key)
   *     description (if any)
   *     ```
   *     value (JSON-serialized for non-strings)
   *     ```
   */
  formatForPrompt(filter?: MemoryFilter): string {
    const entries = this.list(filter);
    if (entries.length === 0) return "";
    const sorted = [...entries].sort((a, b) => a.createdAt - b.createdAt);

    const lines: string[] = ["# Memory (results from prior steps and tasks)"];
    for (const entry of sorted) {
      const heading = entry.title ?? entry.key;
      lines.push("");
      lines.push(`## [${entry.kind}] ${heading} (${entry.key})`);
      if (entry.description) lines.push(entry.description);
      const valueStr =
        typeof entry.value === "string"
          ? entry.value
          : JSON.stringify(entry.value, null, 2);
      lines.push("```");
      lines.push(valueStr);
      lines.push("```");
    }
    return lines.join("\n");
  }

  /** Remove all entries (or those matching a filter). */
  clear(filter?: MemoryFilter): void {
    // Stryker disable next-line ConditionalExpression,BlockStatement: fast path — the loop below with an undefined filter lists and deletes every entry too, so skipping/emptying this block is equivalent.
    if (!filter) {
      this.entries.clear();
      return;
    }
    for (const key of this.list(filter).map((e) => e.key)) {
      this.entries.delete(key);
    }
  }

  /** Subscribe to writes. Returns an unsubscribe function. */
  subscribe(listener: MemoryListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Snapshot all entries (insertion order). */
  snapshot(): MemoryEntry[] {
    return [...this.entries.values()];
  }

  /**
   * Rehydrate from a prior {@link snapshot}. This is the durability seam:
   * callers can persist `snapshot()` to disk/DB at checkpoints and rebuild the
   * store after a crash or process restart, without coupling AgentMemory to
   * any particular storage backend.
   *
   * Each entry is written through {@link set}, so its original `createdAt` is
   * preserved and listeners are notified (reactive consumers can rebuild
   * derived state). Existing keys are overwritten.
   */
  restore(entries: readonly MemoryEntry[]): void {
    for (const entry of entries) {
      this.set({ ...entry });
    }
  }
}
