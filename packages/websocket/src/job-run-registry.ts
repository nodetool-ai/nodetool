/**
 * Detachable workflow runs.
 *
 * The WebSocket runner is per-connection, so before this module existed a
 * dropped socket killed every in-flight run (`disconnect()` →
 * `job.session.cancel()` for each entry of `activeJobs`): a laptop lid-close
 * threw away minutes of paid GPU work, and `reconnect_job` from a fresh
 * connection — a fresh `UnifiedWebSocketRunner`, with an empty `activeJobs` —
 * could only read the persisted row, reporting even a completed run as
 * `job_update failed` with "replay is unavailable". A {@link JobRunSession}
 * decouples the run from the socket, exactly as {@link ChatTurnSession} does
 * for a chat turn: every frame the run emits is stamped with a monotonically
 * increasing `job_seq` and appended to a bounded buffer, and delivery goes to
 * whichever connection is currently attached — or nowhere, while the client
 * is away. On reconnect the client sends
 * `{command: "reconnect_job", data: {job_id, last_seq}}` and gets the missed
 * tail replayed, followed by live frames if the run is still going.
 *
 * Sessions are keyed by user+job in a process-wide registry. Job ids are
 * unique per run, so — unlike a chat thread — a new run never supersedes an
 * existing session; {@link JobRunRegistry.open} replacing an entry means the
 * same job id was started twice, which is a caller bug, not a turn taking
 * over.
 *
 * Two timers bound a session's life:
 *   - detach grace: a running job nobody is attached to is cancelled after
 *     `NODETOOL_JOB_DETACH_GRACE_MS` (default 10 min) so an abandoned client
 *     cannot leave a workflow burning provider spend forever;
 *   - retention: a finished session is kept for
 *     `NODETOOL_JOB_REPLAY_RETENTION_MS` (default 5 min) so a client that
 *     reconnects just after the run ended still gets the tail, then dropped.
 *
 * Terminal state is persisted to the `jobs` table independently of this
 * buffer, so an expired or truncated replay degrades to `reconnect_job`'s
 * persisted-row fallback — the run's real status, just without its events.
 */

import { createLogger } from "@nodetool-ai/config";

const log = createLogger("nodetool.websocket.job-run-registry");

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const MAX_BUFFERED_EVENTS = () =>
  envInt("NODETOOL_JOB_REPLAY_BUFFER_EVENTS", 2000);
const DETACH_GRACE_MS = () =>
  envInt("NODETOOL_JOB_DETACH_GRACE_MS", 10 * 60 * 1000);
const RETENTION_MS = () =>
  envInt("NODETOOL_JOB_REPLAY_RETENTION_MS", 5 * 60 * 1000);

/**
 * A connection that can deliver frames to its client.
 *
 * One at a time: {@link JobRunSession.attach} replaces the target rather than
 * fanning out, so a second tab resubscribing to a run takes the stream from
 * the first. Same as a chat turn, and the same trade — a client that wants
 * two views of one run opens them against one socket.
 */
interface JobRunDeliveryTarget {
  deliver(message: Record<string, unknown>): Promise<void>;
}

/**
 * The executing connection's per-run hooks. Kept on the session so a
 * different connection (post-reconnect) can route a client's `cancel_job` /
 * `stop` / `stream_input` / `update_node_properties` back to the runner that
 * actually owns the `ExecutionSession`.
 */
export interface JobRunExecutionHooks {
  cancel(): void;
  pushInput(input: string, value: unknown, handle?: string): Promise<void>;
  finishInputStream(input: string, handle?: string): void;
  updateNodeProperties(
    nodeId: string,
    properties: Record<string, unknown>
  ): boolean;
}

interface JobRunAttachResult {
  /** Frames with `job_seq` greater than the requested `last_seq`. */
  replay: Array<Record<string, unknown>>;
  /** True when `last_seq` predates what the bounded buffer still holds. */
  incomplete: boolean;
}

interface BufferedEvent {
  seq: number;
  message: Record<string, unknown>;
}

export class JobRunSession {
  readonly userId: string;
  readonly jobId: string;
  readonly workflowId: string | null;
  status: "running" | "finished" = "running";
  /** The run's outcome, once known. Reported in the `job_resumed` header. */
  terminalStatus: string | null = null;

  private seq = 0;
  private buffer: BufferedEvent[] = [];
  /** Highest seq evicted from the bounded buffer (0 = nothing evicted). */
  private evictedThroughSeq = 0;
  private target: JobRunDeliveryTarget | null = null;
  /**
   * Serializes delivery: replayed frames enqueue before any live frame that
   * arrives after attach, so the client always sees seq order. Unbounded —
   * a slow socket grows the chain rather than applying backpressure to the
   * run; the buffer above is what bounds memory. Mirrored from the chat
   * turn's chain.
   */
  private deliveryChain: Promise<void> = Promise.resolve();
  private detachTimer: NodeJS.Timeout | null = null;
  private retentionTimer: NodeJS.Timeout | null = null;

  constructor(
    userId: string,
    jobId: string,
    workflowId: string | null,
    readonly hooks: JobRunExecutionHooks,
    private readonly onDrop: (session: JobRunSession) => void
  ) {
    this.userId = userId;
    this.jobId = jobId;
    this.workflowId = workflowId;
  }

  get lastSeq(): number {
    return this.seq;
  }

  /**
   * Stamp, buffer, and (when a connection is attached) deliver one frame.
   * Returns the stamped copy.
   */
  emit(message: Record<string, unknown>) {
    this.seq += 1;
    const stamped = { ...message, job_seq: this.seq };
    this.buffer.push({ seq: this.seq, message: stamped });
    const max = MAX_BUFFERED_EVENTS();
    while (this.buffer.length > max) {
      const evicted = this.buffer.shift();
      if (evicted) this.evictedThroughSeq = evicted.seq;
    }
    const target = this.target;
    if (target) {
      this.enqueueDelivery(() => target.deliver(stamped));
    }
    return stamped;
  }

  /**
   * Attach a connection and hand back the frames it missed. Live frames
   * emitted after this call are delivered to the new target, strictly after
   * the returned replay is delivered (both ride {@link deliveryChain} when
   * sent via {@link deliverReplay}).
   */
  attach(target: JobRunDeliveryTarget, lastSeq: number): JobRunAttachResult {
    this.clearDetachTimer();
    this.target = target;
    const replay = this.buffer
      .filter((e) => e.seq > lastSeq)
      .map((e) => e.message);
    return { replay, incomplete: lastSeq < this.evictedThroughSeq };
  }

  /** Deliver frames on the session's ordered delivery chain. */
  deliverReplay(
    target: JobRunDeliveryTarget,
    frames: Array<Record<string, unknown>>
  ): Promise<void> {
    for (const frame of frames) {
      this.enqueueDelivery(() => target.deliver(frame));
    }
    return this.deliveryChain;
  }

  /**
   * The attached connection went away. A running job keeps executing and
   * buffering; if nobody reattaches within the grace window the run is
   * cancelled so it cannot burn spend unattended forever.
   */
  detach(target?: JobRunDeliveryTarget): void {
    if (target && this.target !== target) return;
    this.target = null;
    if (this.status !== "running") return;
    this.clearDetachTimer();
    this.detachTimer = setTimeout(() => {
      log.info("Detached job run expired, cancelling", { jobId: this.jobId });
      this.cancel();
    }, DETACH_GRACE_MS());
    this.detachTimer.unref?.();
  }

  /** Cancel the run (client stop, or detach grace elapsed). */
  cancel(): void {
    this.hooks.cancel();
  }

  /**
   * The run reached a terminal state. The session sticks around (still
   * replayable) for the retention window, then drops out of the registry.
   */
  finish(terminalStatus?: string): void {
    if (terminalStatus) this.terminalStatus = terminalStatus;
    if (this.status === "finished") return;
    this.status = "finished";
    this.clearDetachTimer();
    this.retentionTimer = setTimeout(() => this.onDrop(this), RETENTION_MS());
    this.retentionTimer.unref?.();
  }

  /** Release timers when the registry drops the session. */
  dispose(): void {
    this.clearDetachTimer();
    if (this.retentionTimer) {
      clearTimeout(this.retentionTimer);
      this.retentionTimer = null;
    }
  }

  private clearDetachTimer(): void {
    if (this.detachTimer) {
      clearTimeout(this.detachTimer);
      this.detachTimer = null;
    }
  }

  private enqueueDelivery(fn: () => Promise<void>): void {
    this.deliveryChain = this.deliveryChain.then(fn).catch((err) => {
      log.warn("Job run delivery failed", {
        jobId: this.jobId,
        error: err instanceof Error ? err.message : String(err)
      });
    });
  }
}

export class JobRunRegistry {
  private sessions = new Map<string, JobRunSession>();

  private key(userId: string, jobId: string): string {
    return `${userId} ${jobId}`;
  }

  /**
   * Open a session for a starting run. Job ids are unique, so an entry that
   * already exists can only mean the same id was started twice — cancel the
   * stale run before dropping it. Dropping alone would leave it executing
   * with nothing that can reach it: no grace timer, no cancel path, no
   * replay.
   */
  open(
    userId: string,
    jobId: string,
    workflowId: string | null,
    hooks: JobRunExecutionHooks
  ): JobRunSession {
    const key = this.key(userId, jobId);
    const existing = this.sessions.get(key);
    if (existing) {
      log.warn("Job session reopened for an id already running", { jobId });
      if (existing.status === "running") existing.cancel();
      this.drop(existing);
    }
    const session = new JobRunSession(userId, jobId, workflowId, hooks, (s) =>
      this.drop(s)
    );
    this.sessions.set(key, session);
    return session;
  }

  get(userId: string, jobId: string): JobRunSession | null {
    return this.sessions.get(this.key(userId, jobId)) ?? null;
  }

  /** Every run this process is still executing. The cancel poller's input. */
  runningSessions(): JobRunSession[] {
    return [...this.sessions.values()].filter((s) => s.status === "running");
  }

  /**
   * Runs still executing for a user, across every connection. The
   * concurrency caps count runs, not sockets: a detached run still occupies
   * a slot, or a client could reconnect its way past the cap simply by
   * abandoning sockets.
   */
  countRunning(userId: string): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.userId === userId && session.status === "running") count += 1;
    }
    return count;
  }

  /** Same, narrowed to one workflow — the per-workflow cap's denominator. */
  countRunningForWorkflow(userId: string, workflowId: string): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (
        session.userId === userId &&
        session.workflowId === workflowId &&
        session.status === "running"
      ) {
        count += 1;
      }
    }
    return count;
  }

  drop(session: JobRunSession): void {
    const key = this.key(session.userId, session.jobId);
    if (this.sessions.get(key) === session) {
      this.sessions.delete(key);
    }
    session.dispose();
  }
}

/** Process-wide registry: sessions survive their originating connection. */
export const jobRunRegistry = new JobRunRegistry();
