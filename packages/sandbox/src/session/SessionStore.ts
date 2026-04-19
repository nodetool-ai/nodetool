/**
 * SessionStore — lifecycle manager for Sandbox instances on the host.
 *
 * Responsibilities:
 *   - acquire(sessionId)  look up an existing session or allocate a new one
 *   - touch(sessionId)    mark activity; resets the idle timer
 *   - release(sessionId)  stop and remove a session
 *   - TTL sweeper         removes sessions idle past `idleTtlSeconds`
 *   - warm pool           keeps N pre-started sandboxes ready so acquire()
 *                         is near-instant for the common fresh-session case
 *
 * Pause/resume: if a sandbox has been idle longer than `idlePauseSeconds`
 * but not yet past the TTL, it's docker-paused to reclaim RAM by the
 * sweeper. A paused sandbox is auto-resumed on the next `acquire()` for
 * that session id (not on `touch()` — touch only resets the timer).
 *
 * Warm pool: a separate queue of pre-acquired sandboxes with generated
 * session ids. When `acquire()` is called for a fresh id AND no per-call
 * options are supplied, the store takes from the warm pool and registers
 * the sandbox under the caller's id (the sandbox's own `sessionId`
 * property is NOT renamed; it keeps its warm-* generated id). The pool
 * is bypassed when `acquire(id, options)` is given a non-empty `options`
 * object, since the warm sandbox was created only with `defaults` and
 * per-call settings like `workspaceDir`, `env`, or `memLimit` cannot be
 * retrofitted onto an already-running container. The pool is
 * asynchronously topped up after each take.
 */

import { randomBytes } from "node:crypto";
import type {
  Sandbox,
  SandboxOptions,
  SandboxProvider
} from "../SandboxProvider.js";

export interface SessionStoreOptions {
  provider: SandboxProvider;
  /** Max idle seconds before a session is released. Default: 3600. */
  idleTtlSeconds?: number;
  /** Idle seconds before a running session is paused. 0 = never. */
  idlePauseSeconds?: number;
  /** Number of warm sandboxes to keep ready. Default: 0. */
  warmPoolSize?: number;
  /** Base acquire options applied to every new session. */
  defaults?: Partial<SandboxOptions>;
  /** Sweeper cadence in ms. Default: 5000. */
  sweepIntervalMs?: number;
}

interface SessionRecord {
  sandbox: Sandbox;
  sessionId: string;
  lastTouch: number;
  paused: boolean;
}

export class SessionStore {
  private readonly provider: SandboxProvider;
  private readonly idleTtlMs: number;
  private readonly idlePauseMs: number;
  private readonly warmPoolSize: number;
  private readonly defaults: Partial<SandboxOptions>;
  private readonly sweepIntervalMs: number;

  private readonly records = new Map<string, SessionRecord>();
  private readonly warmPool: Sandbox[] = [];
  private closed = false;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private warming = false;

  constructor(options: SessionStoreOptions) {
    this.provider = options.provider;
    this.idleTtlMs = (options.idleTtlSeconds ?? 3600) * 1000;
    this.idlePauseMs = (options.idlePauseSeconds ?? 0) * 1000;
    this.warmPoolSize = options.warmPoolSize ?? 0;
    this.defaults = options.defaults ?? {};
    this.sweepIntervalMs = options.sweepIntervalMs ?? 5000;

    this.sweepTimer = setInterval(() => {
      void this.sweep();
    }, this.sweepIntervalMs);
    // Don't keep the event loop alive just for the sweeper.
    this.sweepTimer.unref?.();

    if (this.warmPoolSize > 0) {
      void this.refillWarmPool();
    }
  }

  /**
   * Return an existing sandbox for the id, or allocate a new one. New
   * sandboxes may come from the warm pool for near-zero latency when the
   * caller doesn't request per-call options — see the class doc-comment
   * for why per-call options bypass the warm pool.
   */
  async acquire(
    sessionId: string,
    options: Partial<SandboxOptions> = {}
  ): Promise<Sandbox> {
    if (this.closed) throw new Error("SessionStore is closed");

    const existing = this.records.get(sessionId);
    if (existing) {
      existing.lastTouch = Date.now();
      if (existing.paused) {
        await existing.sandbox.resume?.();
        existing.paused = false;
      }
      return existing.sandbox;
    }

    // Warm-pool sandboxes were created with only `defaults`; we can't
    // retrofit per-call `workspaceDir` / `env` / `memLimit` / `image`
    // onto an already-running container. Bypass the pool in that case.
    const hasPerCallOptions = Object.keys(options).length > 0;
    const warm = hasPerCallOptions ? undefined : this.warmPool.shift();
    let sandbox: Sandbox;
    if (warm) {
      // Warm sandboxes keep their generated id internally. Wrap so the
      // caller sees the requested sessionId (SandboxProvider contract).
      const wrapper = Object.create(warm);
      wrapper.sessionId = sessionId;
      sandbox = wrapper as Sandbox;
      // Trigger async refill without blocking the caller.
      void this.refillWarmPool();
    } else {
      sandbox = await this.provider.acquire({
        ...this.defaults,
        ...options,
        sessionId
      });
    }

    this.records.set(sessionId, {
      sandbox,
      sessionId,
      lastTouch: Date.now(),
      paused: false
    });
    return sandbox;
  }

  /** Mark activity on a session without fetching the sandbox handle. */
  touch(sessionId: string): void {
    const rec = this.records.get(sessionId);
    if (rec) rec.lastTouch = Date.now();
  }

  /** Get an existing session handle without allocating. */
  get(sessionId: string): Sandbox | undefined {
    return this.records.get(sessionId)?.sandbox;
  }

  has(sessionId: string): boolean {
    return this.records.has(sessionId);
  }

  size(): number {
    return this.records.size;
  }

  warmCount(): number {
    return this.warmPool.length;
  }

  /** Stop and remove a session. */
  async release(sessionId: string): Promise<void> {
    const rec = this.records.get(sessionId);
    if (!rec) return;
    this.records.delete(sessionId);
    await rec.sandbox.release();
  }

  /** Stop all sessions, drain the warm pool, and cancel the sweeper. */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    const all = [
      ...Array.from(this.records.values()).map((r) => r.sandbox.release()),
      ...this.warmPool.splice(0).map((s) => s.release())
    ];
    this.records.clear();
    await Promise.allSettled(all);
  }

  /** @internal — exported for tests. */
  async _sweepForTests(): Promise<void> {
    await this.sweep();
  }

  private async sweep(): Promise<void> {
    if (this.closed) return;
    const now = Date.now();
    const pauseOps: Array<Promise<void>> = [];
    const releaseIds: string[] = [];
    for (const [id, rec] of this.records) {
      const idle = now - rec.lastTouch;
      if (idle >= this.idleTtlMs) {
        releaseIds.push(id);
        continue;
      }
      if (
        !rec.paused &&
        this.idlePauseMs > 0 &&
        idle >= this.idlePauseMs &&
        rec.sandbox.pause
      ) {
        pauseOps.push(
          rec.sandbox
            .pause()
            .then(() => {
              rec.paused = true;
            })
            .catch(() => {
              // best-effort; leave record unpaused
            })
        );
      }
    }
    await Promise.allSettled(pauseOps);
    for (const id of releaseIds) {
      await this.release(id).catch(() => {});
    }
  }

  private async refillWarmPool(): Promise<void> {
    if (this.closed || this.warming) return;
    if (this.warmPool.length >= this.warmPoolSize) return;
    this.warming = true;
    try {
      while (!this.closed && this.warmPool.length < this.warmPoolSize) {
        const id = `warm-${randomBytes(6).toString("hex")}`;
        try {
          const sandbox = await this.provider.acquire({
            ...this.defaults,
            sessionId: id
          });
          this.warmPool.push(sandbox);
        } catch {
          // Back off briefly if the provider is failing — don't spin.
          await new Promise((r) => setTimeout(r, 1000));
          break;
        }
      }
    } finally {
      this.warming = false;
    }
  }
}
