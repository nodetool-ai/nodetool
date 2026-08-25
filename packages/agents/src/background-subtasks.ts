/**
 * Background subtask registry — the per-turn state behind `start_subtask` and
 * `wait_subtasks`.
 *
 * A host creates one per chat turn and hangs it on the
 * `SubAgentToolRuntime.background` field. Every `start_subtask` call in that
 * turn registers its child here; the child's detached pump settles it when the
 * loop ends. `wait_subtasks` blocks on the records instead of on the parent's
 * tool call, which is what lets the parent keep working while children run.
 *
 * The settlement input is structurally compatible with `SubAgentOutcome` (plus
 * an `{aborted: true}` variant) so this module imports nothing from
 * `subagent.ts` — one less edge to cycle.
 */

export type BackgroundSubtaskStatus =
  | "running"
  | "completed"
  | "failed"
  | "aborted";

/** What a pump hands back when the child loop is over. */
export type BackgroundSubtaskSettlement =
  | { ok: true; result: unknown }
  | { ok: false; error: string }
  | { aborted: true };

export interface BackgroundSubtaskSnapshot {
  readonly subtask_id: string;
  readonly description: string;
  /** Child recursion depth (1 = spawned by the root loop). */
  readonly depth: number;
  readonly status: BackgroundSubtaskStatus;
  /** Present when status is "completed". */
  readonly result?: unknown;
  /** Present when status is "failed". */
  readonly error?: string;
}

/** A wait result row: a snapshot, or an unknown id the caller named. */
export type WaitedSubtask =
  | BackgroundSubtaskSnapshot
  | { subtask_id: string; status: "unknown" };

export interface WaitBackgroundOptions {
  /** Collect only these ids; omit to collect every record in the registry. */
  ids?: readonly string[];
  /** How long to block. Clamped to [1s, MAX_WAIT_TIMEOUT_MS]. */
  timeoutMs?: number;
  /** Aborting resolves immediately with current statuses. */
  signal?: AbortSignal;
}

export const DEFAULT_WAIT_TIMEOUT_MS = 300_000;
export const MAX_WAIT_TIMEOUT_MS = 900_000;

const MIN_WAIT_TIMEOUT_MS = 1_000;

/**
 * Tracks background sub-agents for one turn. Not concurrency-safe across
 * threads by design: every mutation happens on the turn's own async path.
 */
export class BackgroundSubtaskRegistry {
  private readonly records = new Map<string, BackgroundSubtaskSnapshotImpl>();
  private version = 0;
  private waiters: Array<() => void> = [];

  /** Register a freshly spawned child as "running". */
  start(id: string, description: string, depth: number): void {
    if (this.records.has(id)) return;
    this.records.set(id, {
      subtask_id: id,
      description,
      depth,
      status: "running"
    });
  }

  /** Mark a child settled. Unknown ids are ignored — start() owns the keys. */
  settle(id: string, settlement: BackgroundSubtaskSettlement): void {
    const record = this.records.get(id);
    if (!record || record.status !== "running") return;
    if (aborted(settlement)) {
      record.status = "aborted";
    } else if (settlement.ok) {
      record.status = "completed";
      record.result = settlement.result;
    } else {
      record.status = "failed";
      record.error = settlement.error;
    }
    this.version++;
    this.notifyWaiters();
  }

  /** Current state of every record, oldest first. */
  snapshot(): BackgroundSubtaskSnapshot[] {
    return [...this.records.values()].map((r) => ({ ...r }));
  }

  /** How many records this turn has started. */
  get size(): number {
    return this.records.size;
  }

  /** Records still running. */
  get runningCount(): number {
    let n = 0;
    for (const r of this.records.values()) if (r.status === "running") n++;
    return n;
  }

  /**
   * Resolve once every requested record left "running", or on timeout or
   * abort — whichever comes first. Timeout and abort resolve with the
   * current statuses rather than throwing; a partial answer beats no answer.
   */
  async wait(opts: WaitBackgroundOptions = {}): Promise<WaitedSubtask[]> {
    const requested = opts.ids?.length ? opts.ids : [...this.records.keys()];
    const timeoutMs = clampTimeout(opts.timeoutMs);

    const rowsFor = (): WaitedSubtask[] =>
      requested.map((id) => {
        const record = this.records.get(id);
        return record ? { ...record } : { subtask_id: id, status: "unknown" };
      });

    const allSettled = (): boolean =>
      requested.every((id) => {
        const r = this.records.get(id);
        return !r || r.status !== "running";
      });

    if (allSettled()) return rowsFor();

    const deadline = new Promise<"timeout">((resolve) => {
      const timer = setTimeout(() => resolve("timeout"), timeoutMs);
      if (typeof timer.unref === "function") timer.unref();
    });
    const abortedP = abortPromise(opts.signal);

    for (;;) {
      if (allSettled()) return rowsFor();
      const outcome = await Promise.race([
        this.untilNextVersion(this.version),
        deadline,
        abortedP
      ]);
      if (outcome === "aborted" || outcome === "timeout") return rowsFor();
      // "notified": loop, re-check at the top.
    }
  }

  private untilNextVersion(seen: number): Promise<"notified"> {
    if (this.version !== seen) return Promise.resolve("notified");
    return new Promise<"notified">((resolve) => {
      this.waiters.push(() => resolve("notified"));
    });
  }

  private notifyWaiters(): void {
    const waiters = this.waiters;
    this.waiters = [];
    for (const w of waiters) w();
  }
}

interface BackgroundSubtaskSnapshotImpl extends BackgroundSubtaskSnapshot {
  status: BackgroundSubtaskStatus;
  result?: unknown;
  error?: string;
}

function aborted(
  s: BackgroundSubtaskSettlement
): s is { aborted: true } {
  return (s as { aborted?: boolean }).aborted === true;
}

function clampTimeout(raw: number | undefined): number {
  const value = typeof raw === "number" && Number.isFinite(raw) ? raw : DEFAULT_WAIT_TIMEOUT_MS;
  return Math.min(Math.max(Math.floor(value), MIN_WAIT_TIMEOUT_MS), MAX_WAIT_TIMEOUT_MS);
}

function abortPromise(signal: AbortSignal | undefined): Promise<"aborted"> {
  if (!signal) return new Promise<"aborted">(() => {});
  if (signal.aborted) return Promise.resolve("aborted");
  return new Promise<"aborted">((resolve) => {
    signal.addEventListener("abort", () => resolve("aborted"), { once: true });
  });
}
