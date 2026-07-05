/**
 * Plan cache + checkpoint store — opt-in persistence for the planning and
 * execution phases.
 *
 * Two independent, optional facilities:
 *
 *   - **PlanCache**: keyed by a stable hash of (objective, sorted tool names
 *     [, model]). A cache hit lets {@link TaskPlanner} skip the entire LLM
 *     planning + validation-retry loop and reuse a prior {@link TaskPlan}.
 *
 *   - **CheckpointStore**: records which tasks an execution has already
 *     finished (and their results). A re-run loads the checkpoint, treats the
 *     completed tasks as done, and resumes from the remainder instead of
 *     re-executing everything.
 *
 * Both are wired in only when a caller supplies them. With no store/cache the
 * planner and executor behave exactly as before — same LLM calls, same
 * scheduling, byte-for-byte identical streams.
 */

import { importNodeBuiltin } from "@nodetool-ai/config";
import { createLogger } from "@nodetool-ai/config";
import type { TaskPlan } from "./types.js";

const log = createLogger("nodetool.agents.checkpoint-store");

// ---------------------------------------------------------------------------
// Stable hashing
// ---------------------------------------------------------------------------

const _nodeCrypto = await importNodeBuiltin<typeof import("node:crypto")>(
  "node:crypto"
);

/**
 * Stable JSON stringify: object keys are sorted recursively so two
 * structurally-equal values always serialize to the same string. Arrays keep
 * their order (caller sorts where order should not matter).
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts = keys.map(
    (k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`
  );
  return `{${parts.join(",")}}`;
}

/**
 * Deterministic non-crypto fallback hash (FNV-1a, 32-bit, hex). Used only when
 * `node:crypto` is unavailable (non-Node runtimes). Collision risk is
 * irrelevant here — the key just needs to be stable for a given input.
 */
function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export interface PlanKeyInput {
  objective: string;
  tools: string[];
  model?: string;
}

/**
 * Build a stable, order-insensitive hash key for a planning request.
 * Tool names are sorted first, so the order they were passed in does not
 * affect the key. Identical objective + tool set (+ optional model) → identical
 * key.
 */
export function hashPlanKey(input: PlanKeyInput): string {
  const canonical = stableStringify({
    objective: input.objective,
    tools: [...input.tools].sort(),
    model: input.model ?? null
  });
  if (_nodeCrypto?.createHash) {
    return _nodeCrypto.createHash("sha256").update(canonical).digest("hex");
  }
  return fnv1aHex(canonical);
}

// ---------------------------------------------------------------------------
// Shared file persistence helpers (read-merge-write, atomic write)
// ---------------------------------------------------------------------------

/**
 * Tolerant read of a `{ [key]: T }` JSON object from disk. A missing or
 * corrupt file yields an empty map rather than throwing — callers treat a
 * cache/store file as best-effort.
 */
async function readDiskEntries<T>(
  fs: typeof import("node:fs/promises"),
  filePath: string
): Promise<Map<string, T>> {
  const disk = new Map<string, T>();
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, T>;
    for (const [k, v] of Object.entries(parsed)) {
      disk.set(k, v);
    }
  } catch {
    // Missing or corrupt file — treat as empty.
  }
  return disk;
}

/**
 * Write `contents` to `filePath` atomically: write to a uniquely-named temp
 * file in the same directory, then `rename` over the target. A reader never
 * observes a half-written file, and a crash mid-write leaves the previous
 * contents intact.
 */
async function writeAtomic(
  fs: typeof import("node:fs/promises"),
  filePath: string,
  contents: string
): Promise<void> {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random()
    .toString(36)
    .slice(2)}.tmp`;
  await fs.writeFile(tmpPath, contents, "utf-8");
  await fs.rename(tmpPath, filePath);
}

// ---------------------------------------------------------------------------
// PlanCache
// ---------------------------------------------------------------------------

export interface PlanCache {
  get(key: string): TaskPlan | undefined;
  set(key: string, plan: TaskPlan): void;
}

/** In-memory plan cache backed by a `Map`. Lives for the process lifetime. */
export class InMemoryPlanCache implements PlanCache {
  private readonly entries = new Map<string, TaskPlan>();

  get(key: string): TaskPlan | undefined {
    return this.entries.get(key);
  }

  set(key: string, plan: TaskPlan): void {
    this.entries.set(key, plan);
  }
}

/**
 * File-backed plan cache. The whole cache is a single JSON object
 * `{ [key]: TaskPlan }` loaded lazily on first access and written on every
 * `set`. All I/O degrades gracefully: a missing/corrupt file starts empty and a
 * failed write is logged, never thrown.
 *
 * Persistence is read-merge-write and serialized through {@link persistQueue}:
 * every `set()` schedules a step that re-reads the current file, layers the
 * in-memory map on top (so a `set()` from an instance that never loaded prior
 * entries — or entries written by another process in the meantime — doesn't
 * wipe them), and writes the result atomically (temp file + rename). Steps run
 * strictly one after another, so concurrent `set()` calls never interleave
 * writes or let an out-of-order completion persist a stale snapshot last.
 */
export class FilePlanCache implements PlanCache {
  private readonly filePath: string;
  private cache: Map<string, TaskPlan> | null = null;
  private persistQueue: Promise<void> = Promise.resolve();

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  private async ensureLoaded(): Promise<Map<string, TaskPlan>> {
    if (this.cache) return this.cache;
    this.cache = new Map();
    const fs = await importNodeBuiltin<typeof import("node:fs/promises")>(
      "node:fs/promises"
    );
    if (!fs) return this.cache;
    for (const [k, v] of await readDiskEntries<TaskPlan>(fs, this.filePath)) {
      this.cache.set(k, v);
    }
    return this.cache;
  }

  /**
   * Queue a read-merge-write persist step behind any already-scheduled ones.
   * Never throws — write failures are logged and the queue continues.
   */
  private schedulePersist(): void {
    this.persistQueue = this.persistQueue.then(() => this.persistOnce());
  }

  private async persistOnce(): Promise<void> {
    const fs = await importNodeBuiltin<typeof import("node:fs/promises")>(
      "node:fs/promises"
    );
    if (!fs || !this.cache) return;
    try {
      const disk = await readDiskEntries<TaskPlan>(fs, this.filePath);
      // In-memory entries win over disk on conflicting keys; disk-only keys
      // (from another instance/process, or entries this instance never
      // loaded) are preserved instead of being wiped by the write.
      const merged = new Map(disk);
      for (const [k, v] of this.cache) {
        merged.set(k, v);
      }
      await writeAtomic(
        fs,
        this.filePath,
        JSON.stringify(Object.fromEntries(merged))
      );
      // Absorb disk-only keys into the in-memory mirror so a subsequent sync
      // `get()` can observe entries persisted elsewhere.
      for (const [k, v] of merged) {
        if (!this.cache.has(k)) this.cache.set(k, v);
      }
    } catch (err) {
      log.warn("FilePlanCache persist failed", {
        filePath: this.filePath,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  /**
   * Synchronous read against the in-memory mirror. Call {@link load} once
   * before relying on `get` so the file contents are available.
   */
  get(key: string): TaskPlan | undefined {
    return this.cache?.get(key);
  }

  /** Mutates the in-memory mirror and queues an async read-merge-write persist. */
  set(key: string, plan: TaskPlan): void {
    if (!this.cache) this.cache = new Map();
    this.cache.set(key, plan);
    this.schedulePersist();
  }

  /** Eagerly load the file into memory so `get` returns persisted entries. */
  async load(): Promise<void> {
    await this.ensureLoaded();
  }
}

// ---------------------------------------------------------------------------
// CheckpointStore
// ---------------------------------------------------------------------------

export interface Checkpoint {
  /** Hash of the plan this checkpoint belongs to (see {@link hashPlanKey}). */
  planHash: string;
  /** IDs of tasks that finished successfully. */
  completedTaskIds: string[];
  /** Optional snapshot of completed-task results, keyed by task id. */
  taskResults?: Record<string, unknown>;
}

export interface CheckpointStore {
  load(runId: string): Checkpoint | undefined;
  save(runId: string, checkpoint: Checkpoint): void;
}

/** In-memory checkpoint store backed by a `Map`. Lives for the process lifetime. */
export class InMemoryCheckpointStore implements CheckpointStore {
  private readonly entries = new Map<string, Checkpoint>();

  load(runId: string): Checkpoint | undefined {
    return this.entries.get(runId);
  }

  save(runId: string, checkpoint: Checkpoint): void {
    this.entries.set(runId, checkpoint);
  }
}

/**
 * File-backed checkpoint store. The whole store is a single JSON object
 * `{ [runId]: Checkpoint }`. Same graceful-degradation contract as
 * {@link FilePlanCache}: read failures start empty, write failures are logged.
 *
 * Persistence follows the same read-merge-write, atomic-write, serialized-queue
 * scheme as {@link FilePlanCache} — see its class doc for the rationale.
 */
export class FileCheckpointStore implements CheckpointStore {
  private readonly filePath: string;
  private store: Map<string, Checkpoint> | null = null;
  private persistQueue: Promise<void> = Promise.resolve();

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  private async ensureLoaded(): Promise<Map<string, Checkpoint>> {
    if (this.store) return this.store;
    this.store = new Map();
    const fs = await importNodeBuiltin<typeof import("node:fs/promises")>(
      "node:fs/promises"
    );
    if (!fs) return this.store;
    for (const [k, v] of await readDiskEntries<Checkpoint>(
      fs,
      this.filePath
    )) {
      this.store.set(k, v);
    }
    return this.store;
  }

  /**
   * Queue a read-merge-write persist step behind any already-scheduled ones.
   * Never throws — write failures are logged and the queue continues.
   */
  private schedulePersist(): void {
    this.persistQueue = this.persistQueue.then(() => this.persistOnce());
  }

  private async persistOnce(): Promise<void> {
    const fs = await importNodeBuiltin<typeof import("node:fs/promises")>(
      "node:fs/promises"
    );
    if (!fs || !this.store) return;
    try {
      const disk = await readDiskEntries<Checkpoint>(fs, this.filePath);
      // In-memory entries win over disk on conflicting keys; disk-only keys
      // (from another instance/process, or entries this instance never
      // loaded) are preserved instead of being wiped by the write.
      const merged = new Map(disk);
      for (const [k, v] of this.store) {
        merged.set(k, v);
      }
      await writeAtomic(
        fs,
        this.filePath,
        JSON.stringify(Object.fromEntries(merged))
      );
      // Absorb disk-only keys into the in-memory mirror so a subsequent sync
      // `load()` can observe entries persisted elsewhere.
      for (const [k, v] of merged) {
        if (!this.store.has(k)) this.store.set(k, v);
      }
    } catch (err) {
      log.warn("FileCheckpointStore persist failed", {
        filePath: this.filePath,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  load(runId: string): Checkpoint | undefined {
    return this.store?.get(runId);
  }

  save(runId: string, checkpoint: Checkpoint): void {
    if (!this.store) this.store = new Map();
    this.store.set(runId, checkpoint);
    this.schedulePersist();
  }

  /** Eagerly load the file into memory so `load` returns persisted entries. */
  async loadFromDisk(): Promise<void> {
    await this.ensureLoaded();
  }
}
