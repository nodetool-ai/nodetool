/**
 * Detachable chat/agent turns.
 *
 * The WebSocket runner is per-connection, so before this module existed a
 * dropped socket aborted the in-flight chat turn (`disconnect()` →
 * `cancelChatTurn()`): a laptop lid-close killed the agent mid-work and the
 * client had nothing to reattach to. A {@link ChatTurnSession} decouples the
 * turn from the socket: every frame the turn emits is stamped with a
 * monotonically increasing `chat_seq` and appended to a bounded buffer, and
 * delivery goes to whichever connection is currently attached — or nowhere,
 * while the client is away. On reconnect the client sends
 * `{command: "resume_chat", data: {thread_id, last_seq}}` and gets the missed
 * tail replayed, followed by live frames if the turn is still running.
 *
 * Sessions are keyed by user+thread in a process-wide registry (one turn per
 * thread; a new turn supersedes and aborts the previous one, matching the
 * single-turn semantics `beginChatTurn` already enforces per connection).
 * Two timers bound a session's life:
 *   - detach grace: a running turn nobody is attached to is aborted after
 *     `NODETOOL_CHAT_DETACH_GRACE_MS` (default 10 min) so an abandoned client
 *     cannot leave an agent working forever;
 *   - retention: a finished session is kept for
 *     `NODETOOL_CHAT_REPLAY_RETENTION_MS` (default 5 min) so a client that
 *     reconnects just after the turn ended still gets the tail, then dropped.
 *
 * Assistant/tool messages are persisted to the DB independently of this
 * buffer, so an expired or truncated replay degrades to the client refetching
 * thread history over REST — nothing is lost except unpersisted stream chunks.
 */

import { createLogger } from "@nodetool-ai/config";

const log = createLogger("nodetool.websocket.chat-turn-registry");

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const MAX_BUFFERED_EVENTS = () =>
  envInt("NODETOOL_CHAT_REPLAY_BUFFER_EVENTS", 2000);
const DETACH_GRACE_MS = () =>
  envInt("NODETOOL_CHAT_DETACH_GRACE_MS", 10 * 60 * 1000);
const RETENTION_MS = () =>
  envInt("NODETOOL_CHAT_REPLAY_RETENTION_MS", 5 * 60 * 1000);

/**
 * Why a turn was aborted. Rides `controller.abort(reason)`, so the handler
 * reading `signal.reason` can tell a shutdown from the user's own Stop — the
 * one case that leaves a note in the transcript.
 */
export type ChatTurnAbortReason = "stop" | "superseded" | "shutdown";

/** A connection that can deliver frames to its client. */
interface ChatTurnDeliveryTarget {
  deliver(message: Record<string, unknown>): Promise<void>;
}

/**
 * The executing connection's per-turn hooks. Kept on the session so a
 * different connection (post-reconnect) can route a client's `tool_result` /
 * approval / `stop` back to the runner that actually owns the turn.
 */
export interface ChatTurnExecutionHooks {
  resolveToolResult(toolCallId: string, payload: Record<string, unknown>): void;
  resolveApproval(approvalId: string, payload: Record<string, unknown>): void;
  cancelPendingCalls(threadId: string): void;
}

interface ChatTurnAttachResult {
  /** Frames with `chat_seq` greater than the requested `last_seq`. */
  replay: Array<Record<string, unknown>>;
  /** True when `last_seq` predates what the bounded buffer still holds. */
  incomplete: boolean;
}

interface BufferedEvent {
  seq: number;
  message: Record<string, unknown>;
}

export class ChatTurnSession {
  readonly userId: string;
  readonly threadId: string;
  status: "running" | "finished" = "running";

  private seq: number;
  private buffer: BufferedEvent[] = [];
  /** Highest seq evicted from the bounded buffer (0 = nothing evicted). */
  private evictedThroughSeq: number;
  private target: ChatTurnDeliveryTarget | null = null;
  /**
   * Serializes delivery: replayed frames enqueue before any live frame that
   * arrives after attach, so the client always sees seq order.
   */
  private deliveryChain: Promise<void> = Promise.resolve();
  private detachTimer: NodeJS.Timeout | null = null;
  private retentionTimer: NodeJS.Timeout | null = null;

  constructor(
    userId: string,
    threadId: string,
    private readonly controller: AbortController,
    readonly hooks: ChatTurnExecutionHooks,
    private readonly onDrop: (session: ChatTurnSession) => void,
    startSeq: number,
    /** Told when the turn settles, so the registry can answer `drained`. */
    private readonly onFinish: () => void = () => {}
  ) {
    this.userId = userId;
    this.threadId = threadId;
    this.seq = startSeq;
    this.evictedThroughSeq = startSeq;
  }

  get lastSeq(): number {
    return this.seq;
  }

  /**
   * Where a client with no frame state (a freshly reloaded page) should
   * start its replay: after the turn's last `message` frame. Everything up
   * to and including that frame is persisted to the DB and reachable over
   * REST; what follows — stream chunks of the in-progress reply, status
   * updates, pending tool/approval requests — exists only in this buffer.
   * With no `message` frame buffered yet, replay starts at the oldest
   * frame still held.
   */
  freshAttachSeq(): number {
    for (let i = this.buffer.length - 1; i >= 0; i--) {
      const entry = this.buffer[i];
      if (entry.message.type === "message") {
        return entry.seq;
      }
    }
    return this.evictedThroughSeq;
  }

  /**
   * Stamp, buffer, and (when a connection is attached) deliver one frame.
   * Returns the stamped copy.
   */
  emit(message: Record<string, unknown>) {
    this.seq += 1;
    const stamped = { ...message, chat_seq: this.seq };
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
  attach(target: ChatTurnDeliveryTarget, lastSeq: number): ChatTurnAttachResult {
    this.clearDetachTimer();
    this.target = target;
    const replay = this.buffer
      .filter((e) => e.seq > lastSeq)
      .map((e) => e.message);
    return { replay, incomplete: lastSeq < this.evictedThroughSeq };
  }

  /** Deliver frames on the session's ordered delivery chain. */
  deliverReplay(
    target: ChatTurnDeliveryTarget,
    frames: Array<Record<string, unknown>>
  ): Promise<void> {
    for (const frame of frames) {
      this.enqueueDelivery(() => target.deliver(frame));
    }
    return this.deliveryChain;
  }

  /**
   * The attached connection went away. A running turn keeps executing and
   * buffering; if nobody reattaches within the grace window the turn is
   * aborted so it cannot run unattended forever.
   */
  detach(target?: ChatTurnDeliveryTarget): void {
    if (target && this.target !== target) return;
    this.target = null;
    if (this.status !== "running") return;
    this.clearDetachTimer();
    this.detachTimer = setTimeout(() => {
      log.info("Detached chat turn expired, aborting", {
        threadId: this.threadId
      });
      this.abort("stop");
    }, DETACH_GRACE_MS());
    this.detachTimer.unref?.();
  }

  /**
   * Abort the turn. The reason reaches the handler as `signal.reason`: only
   * `"shutdown"` is something the user did not do and does not already know
   * about, so only that one is written into the transcript.
   */
  abort(reason: ChatTurnAbortReason): void {
    this.controller.abort(reason);
    this.hooks.cancelPendingCalls(this.threadId);
  }

  /**
   * The turn's promise settled. The session sticks around (still replayable)
   * for the retention window, then drops out of the registry.
   */
  finish(): void {
    if (this.status === "finished") return;
    this.status = "finished";
    this.clearDetachTimer();
    this.retentionTimer = setTimeout(() => this.onDrop(this), RETENTION_MS());
    this.retentionTimer.unref?.();
    this.onFinish();
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
      log.warn("Chat turn delivery failed", {
        threadId: this.threadId,
        error: err instanceof Error ? err.message : String(err)
      });
    });
  }
}

export class ChatTurnRegistry {
  private sessions = new Map<string, ChatTurnSession>();
  /**
   * Per-thread seq high-water marks, so a new turn continues numbering where
   * the previous one left off and a client's `last_seq` from an older turn
   * can never accidentally skip a newer turn's frames. Bounded: oldest
   * entries are evicted past {@link MAX_SEQ_ENTRIES}.
   */
  private lastSeqByThread = new Map<string, number>();
  private static readonly MAX_SEQ_ENTRIES = 10_000;
  /** Resolvers waiting for {@link runningCount} to reach zero. */
  private drainWaiters = new Set<() => void>();

  private key(userId: string, threadId: string): string {
    return `${userId}\u0000${threadId}`;
  }

  /**
   * Open a session for a new turn. An existing session for the same thread is
   * superseded: aborted (if still running) and dropped, exactly as a new
   * `chat_message` on a live connection cancels the previous turn.
   */
  open(
    userId: string,
    threadId: string,
    controller: AbortController,
    hooks: ChatTurnExecutionHooks
  ): ChatTurnSession {
    const key = this.key(userId, threadId);
    const existing = this.sessions.get(key);
    if (existing) {
      if (existing.status === "running") existing.abort("superseded");
      this.drop(existing);
    }
    const session = new ChatTurnSession(
      userId,
      threadId,
      controller,
      hooks,
      (s) => this.drop(s),
      this.lastSeqByThread.get(key) ?? 0,
      () => this.notifyDrainWaiters()
    );
    this.sessions.set(key, session);
    return session;
  }

  get(userId: string, threadId: string): ChatTurnSession | null {
    return this.sessions.get(this.key(userId, threadId)) ?? null;
  }

  /** Sessions still running for a user — what a fresh client can reattach to. */
  listRunningForUser(userId: string): ChatTurnSession[] {
    return [...this.sessions.values()].filter(
      (s) => s.userId === userId && s.status === "running"
    );
  }

  /** Turns this process is still executing. What a drain waits on. */
  runningCount(): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.status === "running") count += 1;
    }
    return count;
  }

  /** Abort every running turn with one reason. Returns how many were aborted. */
  abortAll(reason: ChatTurnAbortReason): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.status !== "running") continue;
      session.abort(reason);
      count += 1;
    }
    return count;
  }

  /**
   * Resolve true once no turn is running, false when `timeoutMs` elapses
   * first. A turn is running until its handler has settled, which is what
   * writes the stand-in tool-result rows — so a shutdown that waits on this
   * leaves a well-formed transcript behind.
   */
  drained(timeoutMs: number): Promise<boolean> {
    if (this.runningCount() === 0) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      const waiter = () => {
        if (this.runningCount() > 0) return;
        clearTimeout(timer);
        this.drainWaiters.delete(waiter);
        resolve(true);
      };
      const timer = setTimeout(() => {
        this.drainWaiters.delete(waiter);
        resolve(false);
      }, timeoutMs);
      timer.unref?.();
      this.drainWaiters.add(waiter);
    });
  }

  private notifyDrainWaiters(): void {
    for (const waiter of [...this.drainWaiters]) waiter();
  }

  drop(session: ChatTurnSession): void {
    const key = this.key(session.userId, session.threadId);
    if (this.sessions.get(key) === session) {
      this.sessions.delete(key);
    }
    // max(): a superseded session's late retention-drop must not lower the
    // high-water mark below what its successor already emitted.
    this.lastSeqByThread.set(
      key,
      Math.max(this.lastSeqByThread.get(key) ?? 0, session.lastSeq)
    );
    while (this.lastSeqByThread.size > ChatTurnRegistry.MAX_SEQ_ENTRIES) {
      const oldest = this.lastSeqByThread.keys().next().value;
      if (oldest === undefined) break;
      this.lastSeqByThread.delete(oldest);
    }
    session.dispose();
    // A superseded turn leaves the map while still marked running, so the
    // count can reach zero here as well as in `finish`.
    this.notifyDrainWaiters();
  }
}

/** Process-wide registry: sessions survive their originating connection. */
export const chatTurnRegistry = new ChatTurnRegistry();
