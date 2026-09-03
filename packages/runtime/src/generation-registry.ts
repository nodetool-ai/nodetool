/**
 * Process-level registry of in-flight generations.
 *
 * A generation outlives the turn that started it — `background: true` returns
 * before the provider answers, and a cancelled chat turn does not cancel the
 * render — so the handle that can abort it and the waiters that want its
 * outcome live at the process, not on a run. The shape is
 * `packages/agents/src/background-subtasks.ts` lifted one level up: a record
 * map, waiters, settled outcomes kept for a while so a late `wait` still gets
 * its answer.
 *
 * Design: docs/media-generation-tracking-design.md § 5.4.
 */

import type { GenerationReceipt, GenerationStatus } from "@nodetool-ai/protocol";

export interface GenerationOutcome {
  status: GenerationStatus;
  error?: string | null;
  asset_ids: string[];
  receipt: GenerationReceipt | null;
}

interface RunningEntry {
  userId: string;
  abort: () => void;
  waiters: Array<(outcome: GenerationOutcome) => void>;
}

/** A settled outcome plus what {@link GenerationRegistry.completedSince} needs. */
interface SettledEntry {
  outcome: GenerationOutcome;
  userId: string | null;
  settledAt: number;
}

/** One generation that finished and left assets behind. */
export interface CompletedGeneration {
  id: string;
  asset_ids: string[];
}

/** How many settled outcomes to keep for late waiters. */
const SETTLED_CAPACITY = 1000;

class GenerationRegistry {
  private readonly running = new Map<string, RunningEntry>();
  private readonly settled = new Map<string, SettledEntry>();

  register(id: string, entry: { userId: string; abort: () => void }): void {
    this.running.set(id, { ...entry, waiters: [] });
  }

  settle(id: string, outcome: GenerationOutcome): void {
    const entry = this.running.get(id);
    this.running.delete(id);
    this.settled.set(id, {
      outcome,
      userId: entry?.userId ?? null,
      settledAt: Date.now()
    });
    if (this.settled.size > SETTLED_CAPACITY) {
      const oldest = this.settled.keys().next().value;
      if (oldest !== undefined) this.settled.delete(oldest);
    }
    if (!entry) return;
    for (const waiter of entry.waiters) waiter(outcome);
  }

  /**
   * Abort a running generation. False when the id is unknown, already
   * settled, or belongs to another user — the caller cannot tell those apart
   * on purpose, so an id is not an oracle for someone else's activity.
   */
  cancel(id: string, userId: string): boolean {
    const entry = this.running.get(id);
    if (!entry || entry.userId !== userId) return false;
    entry.abort();
    return true;
  }

  /**
   * Resolve with the outcome once the generation settles, or `null` after
   * `timeoutMs`. An id that already settled resolves at once; an unknown id
   * resolves `null` at once rather than waiting for something that will never
   * come.
   */
  wait(id: string, timeoutMs: number): Promise<GenerationOutcome | null> {
    const done = this.settled.get(id);
    if (done) return Promise.resolve(done.outcome);
    const entry = this.running.get(id);
    if (!entry) return Promise.resolve(null);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const idx = entry.waiters.indexOf(waiter);
        if (idx >= 0) entry.waiters.splice(idx, 1);
        resolve(null);
      }, timeoutMs);
      const waiter = (outcome: GenerationOutcome): void => {
        clearTimeout(timer);
        resolve(outcome);
      };
      entry.waiters.push(waiter);
    });
  }

  isRunning(id: string): boolean {
    return this.running.has(id);
  }

  /** The settled outcome, when the registry still holds it. */
  outcome(id: string): GenerationOutcome | null {
    return this.settled.get(id)?.outcome ?? null;
  }

  /**
   * Generations that completed for a user since `sinceMs` and left assets.
   *
   * A step killed by its deadline loses whatever the guest had not written
   * down yet, and generations are the expensive half of that: the provider was
   * paid, the assets were saved, and the only record the next turn had was
   * gone. This is how a caller names them so the work is reused rather than
   * bought twice.
   */
  completedSince(userId: string, sinceMs: number): CompletedGeneration[] {
    const found: CompletedGeneration[] = [];
    for (const [id, entry] of this.settled) {
      if (entry.userId !== userId) continue;
      if (entry.settledAt < sinceMs) continue;
      if (entry.outcome.status !== "completed") continue;
      if (entry.outcome.asset_ids.length === 0) continue;
      found.push({ id, asset_ids: entry.outcome.asset_ids });
    }
    return found;
  }

  /** Ids currently running for a user. */
  runningFor(userId: string): string[] {
    const ids: string[] = [];
    for (const [id, entry] of this.running) {
      if (entry.userId === userId) ids.push(id);
    }
    return ids;
  }

  /** Test seam: forget everything. */
  reset(): void {
    this.running.clear();
    this.settled.clear();
  }
}

export const generationRegistry: GenerationRegistry = new GenerationRegistry();
