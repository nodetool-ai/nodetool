/**
 * Debounced background runs, keyed. The project index, the folder watcher and
 * the asset manifest writer each collapse a burst of triggers into one run.
 */

interface Scheduled {
  timer: NodeJS.Timeout;
  firstAt: number;
  run: () => Promise<void>;
}

export interface DebouncedRunsOptions {
  /** Quiet time after the last call under a key before its run starts, in ms. */
  debounceMs: number;
  /** Longest a run waits while calls under its key keep arriving, in ms. */
  maxWaitMs: number;
  /** Receives the error of a run that rejected. A run never rejects outward. */
  onError: (error: unknown) => void;
}

export class DebouncedRuns {
  private readonly scheduled = new Map<string, Scheduled>();
  private readonly running = new Set<Promise<void>>();

  constructor(private readonly options: DebouncedRunsOptions) {}

  /**
   * Run `run` once the calls under `key` have been quiet for `debounceMs`,
   * and no later than `maxWaitMs` after the first of them. A later call under
   * the same key replaces the run of an earlier one that has not started.
   */
  schedule(key: string, run: () => Promise<void>): void {
    const now = Date.now();
    const pending = this.scheduled.get(key);
    if (pending) clearTimeout(pending.timer);
    const firstAt = pending?.firstAt ?? now;
    const wait = Math.max(
      0,
      Math.min(
        this.options.debounceMs,
        firstAt + this.options.maxWaitMs - now
      )
    );
    const timer = setTimeout(() => this.start(key), wait);
    // A pending run must not hold the process open at shutdown.
    timer.unref?.();
    this.scheduled.set(key, { timer, firstAt, run });
  }

  /**
   * Run `run` after `delayMs`, unless a run is already scheduled under `key`.
   * A later {@link schedule} under the same key replaces it.
   */
  scheduleUnlessPending(
    key: string,
    delayMs: number,
    run: () => Promise<void>
  ): void {
    if (this.scheduled.has(key)) return;
    const timer = setTimeout(() => this.start(key), delayMs);
    timer.unref?.();
    this.scheduled.set(key, { timer, firstAt: Date.now(), run });
  }

  /** Drop every scheduled run that has not started. */
  cancelAll(): void {
    for (const entry of this.scheduled.values()) clearTimeout(entry.timer);
    this.scheduled.clear();
  }

  /** Drop the run scheduled under `key`, if it has not started. */
  cancel(key: string): void {
    const pending = this.scheduled.get(key);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.scheduled.delete(key);
  }

  /** Whether any run is scheduled or still running. */
  get busy(): boolean {
    return this.scheduled.size > 0 || this.running.size > 0;
  }

  /** Start every scheduled run now and wait for all of them to finish. */
  async flush(): Promise<void> {
    for (const key of [...this.scheduled.keys()]) this.start(key);
    while (this.running.size > 0) await Promise.all([...this.running]);
  }

  private start(key: string): void {
    const entry = this.scheduled.get(key);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.scheduled.delete(key);
    const done = entry.run().catch((error: unknown) => {
      this.options.onError(error);
    });
    this.running.add(done);
    void done.then(() => this.running.delete(done));
  }
}
