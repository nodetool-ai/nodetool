/**
 * TurnRouter — one turn at a time per conversation, one socket per user
 * (design §6).
 *
 * The router is where identity, the chat socket and the pure frame renderer
 * meet. It owns three things the other modules deliberately do not:
 *
 * - **Whose socket.** A Telegram user's turns run on a `ChatSocket` opened
 *   with that user's delegated token, so every turn is the server's own
 *   tenant-isolated path. Two users never share a socket.
 * - **Turn order.** A private chat is one conversation: a second message while
 *   a turn runs queues behind it (capped), mirroring the server's per-thread
 *   turn lock instead of racing it.
 * - **The clock.** `foldFrame` is clockless by construction; this layer is
 *   where `Date.now()` enters, which keeps the renderer's throttling rules
 *   exercisable by scripted tests.
 *
 * Nothing here imports the Telegram API or the NodeTool SDK: the socket, the
 * thread listing and the delivery of render ops are all injected.
 */

import { createHash } from "node:crypto";

import type { RenderFrame, RenderOp, RendererState } from "./frame-renderer.js";
import { createRendererState, foldFrame } from "./frame-renderer.js";
import type { IdentityResolution, UnlinkedReason } from "./identity-client.js";

// ---------------------------------------------------------------------------
// Injected collaborators
// ---------------------------------------------------------------------------

/** The identity surface the router needs — a subset of `IdentityClient`. */
export interface IdentityResolver {
  resolve(externalId: string): Promise<IdentityResolution>;
  invalidate(externalId: string): void;
}

/** One outbound turn, in the shape the server's `chat_message` command takes. */
export interface BridgeSendOptions {
  readonly threadId: string;
  readonly text: string;
  readonly provider?: string | null;
  readonly model?: string | null;
  readonly agentMode?: boolean;
  readonly permissionMode?: "plan" | "default" | "auto" | null;
}

/**
 * The chat socket, narrowed to what the bridge uses. `@nodetool-ai/sdk`'s
 * `ChatSocket` is wrapped into this shape in `nodetool-client.ts`, so the
 * router stays free of the SDK — and of `ws`.
 */
export interface BridgeChatSocket {
  connect(): void;
  disconnect(): void;
  send(options: BridgeSendOptions): void;
  stop(threadId: string): void;
  /** Replay everything after `lastSeq` on this thread (`resume_chat`). */
  resume(threadId: string, lastSeq: number): void;
  /** Every inbound frame, including types without a typed handler. */
  onFrame(listener: (frame: RenderFrame) => void): () => void;
  /** Connection-state transitions; `connected` after a drop triggers resume. */
  onStateChange(listener: (state: string) => void): () => void;
}

/** A connected NodeTool client bound to one user's delegated token. */
export interface BridgeClient {
  readonly socket: BridgeChatSocket;
  /** Thread ids owned by this user, for `n` recovery after a restart. */
  listThreadIds(): Promise<readonly string[]>;
}

export type MakeBridgeClient = (session: {
  readonly token: string;
  readonly userId: string;
}) => BridgeClient;

/** Everything the adapter needs to place a turn's ops in the right chat. */
export interface DeliveryContext {
  readonly chatId: string;
  readonly telegramUserId: string;
  /** NodeTool user the turn runs as. */
  readonly userId: string;
  readonly threadId: string;
  /** Delegated token, so the adapter can fetch the user's own assets. */
  readonly token: string;
}

export type ExecuteOps = (
  context: DeliveryContext,
  ops: readonly RenderOp[]
) => void | Promise<void>;

export interface TurnRouterOptions {
  readonly identity: IdentityResolver;
  readonly makeClient: MakeBridgeClient;
  readonly config: TurnRouterConfig;
  readonly executeOps: ExecuteOps;
  /** Clock, in ms. Defaults to `Date.now`. */
  readonly nowMs?: () => number;
}

export interface TurnRouterConfig {
  readonly editThrottleMs: number;
  readonly maxQueuedTurns: number;
  /** Provider override for every turn; null leaves the server's default. */
  readonly provider?: string | null;
  readonly model?: string | null;
  /**
   * There is no interactive approver on this surface, so `auto` is the mode
   * that makes a turn complete rather than park forever (design §9).
   */
  readonly permissionMode?: "plan" | "default" | "auto";
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export type SubmitResult =
  | { readonly status: "started"; readonly threadId: string }
  | { readonly status: "queued"; readonly threadId: string; readonly depth: number }
  | { readonly status: "busy"; readonly depth: number }
  | {
      readonly status: "unlinked";
      readonly reason: UnlinkedReason;
      readonly message: string;
    };

export interface SubmitInput {
  readonly telegramUserId: string;
  readonly chatId: string;
  readonly text: string;
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

interface QueuedTurn {
  readonly text: string;
}

interface RunningTurn {
  readonly threadId: string;
  renderer: RendererState;
  /** Highest frame seq applied, for `resume_chat`. */
  lastSeq: number;
  /** The turn's frames have been requested; a reconnect now means resume. */
  sent: boolean;
}

interface Conversation {
  readonly chatId: string;
  readonly telegramUserId: string;
  /** Sequence number `n` of the current thread id. */
  threadIndex: number;
  readonly queue: QueuedTurn[];
  running: RunningTurn | null;
  /** Serializes op delivery so a chat's messages are never reordered. */
  chain: Promise<void>;
}

interface Session {
  readonly telegramUserId: string;
  readonly userId: string;
  readonly token: string;
  /** First 8 hex of sha256(userId) — see design §4 on cross-tenant ids. */
  readonly uid8: string;
  readonly client: BridgeClient;
  readonly dispose: () => void;
  /** Conversations whose `n` has been recovered from the server. */
  readonly recovered: Set<string>;
}

/** Frames carry `chat_seq` on the wire; the renderer reads `seq`. */
function normalizeFrame(frame: RenderFrame): RenderFrame {
  const carried = (frame as { chat_seq?: unknown }).chat_seq;
  if (typeof carried === "number" && typeof frame.seq !== "number") {
    return { ...frame, seq: carried };
  }
  return frame;
}

function threadIdOf(frame: RenderFrame): string | null {
  const value = (frame as { thread_id?: unknown }).thread_id;
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** `telegram-<chatId>-<uid8>-<n>`. */
export function deriveThreadId(chatId: string, uid8: string, index: number): string {
  return `telegram-${chatId}-${uid8}-${index}`;
}

/** The short user hash that keeps two tenants' derived ids disjoint. */
export function userHash8(userId: string): string {
  return createHash("sha256").update(userId).digest("hex").slice(0, 8);
}

/** Highest `n` among ids already in this chat's series, or 0 when there is none. */
export function highestThreadIndex(
  threadIds: readonly string[],
  chatId: string,
  uid8: string
): number {
  const prefix = `telegram-${chatId}-${uid8}-`;
  let highest = 0;
  for (const id of threadIds) {
    if (!id.startsWith(prefix)) {
      continue;
    }
    const index = Number.parseInt(id.slice(prefix.length), 10);
    if (Number.isInteger(index) && index > highest) {
      highest = index;
    }
  }
  return highest;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export class TurnRouter {
  private readonly identity: IdentityResolver;
  private readonly makeClient: MakeBridgeClient;
  private readonly config: TurnRouterConfig;
  private readonly executeOps: ExecuteOps;
  private readonly now: () => number;

  private readonly sessions = new Map<string, Session>();
  private readonly conversations = new Map<string, Conversation>();
  private readonly byThread = new Map<string, Conversation>();

  constructor(options: TurnRouterOptions) {
    this.identity = options.identity;
    this.makeClient = options.makeClient;
    this.config = options.config;
    this.executeOps = options.executeOps;
    this.now = options.nowMs ?? Date.now;
  }

  /**
   * Take one inbound message. Starts a turn when the conversation is idle,
   * queues it when a turn is running, and answers busy when the queue is full.
   */
  async submit(input: SubmitInput): Promise<SubmitResult> {
    const resolution = await this.identity.resolve(input.telegramUserId);
    if (resolution.unlinked) {
      return {
        status: "unlinked",
        reason: resolution.reason,
        message: resolution.message
      };
    }

    const session = this.ensureSession(input.telegramUserId, resolution.token, resolution.userId);
    const conversation = await this.ensureConversation(session, input.chatId);

    if (conversation.running !== null) {
      if (conversation.queue.length >= this.config.maxQueuedTurns) {
        return { status: "busy", depth: conversation.queue.length };
      }
      conversation.queue.push({ text: input.text });
      return {
        status: "queued",
        threadId: deriveThreadId(conversation.chatId, session.uid8, conversation.threadIndex),
        depth: conversation.queue.length
      };
    }

    const threadId = this.startTurn(session, conversation, input.text);
    return { status: "started", threadId };
  }

  /** Cancel the in-flight turn in this chat. False when nothing was running. */
  stop(chatId: string): boolean {
    const conversation = this.conversations.get(chatId);
    if (!conversation || conversation.running === null) {
      return false;
    }
    const session = this.sessions.get(conversation.telegramUserId);
    if (!session) {
      return false;
    }
    session.client.socket.stop(conversation.running.threadId);
    return true;
  }

  /**
   * Rotate this chat onto a fresh thread (`/new`). Anything queued behind the
   * current turn is dropped: the user asked for a clean slate, and delivering
   * old messages into a new thread would be the opposite.
   */
  newThread(chatId: string): string | null {
    const conversation = this.conversations.get(chatId);
    const session = conversation ? this.sessions.get(conversation.telegramUserId) : undefined;
    if (!conversation || !session) {
      return null;
    }
    conversation.queue.length = 0;
    if (conversation.running !== null) {
      this.byThread.delete(conversation.running.threadId);
      conversation.running = null;
    }
    conversation.threadIndex += 1;
    return deriveThreadId(chatId, session.uid8, conversation.threadIndex);
  }

  /** Current thread id for a chat, when one has been established. */
  currentThreadId(chatId: string): string | null {
    const conversation = this.conversations.get(chatId);
    const session = conversation ? this.sessions.get(conversation.telegramUserId) : undefined;
    if (!conversation || !session) {
      return null;
    }
    return deriveThreadId(chatId, session.uid8, conversation.threadIndex);
  }

  /** Messages waiting behind the in-flight turn, for `/status`. */
  queueDepth(chatId: string): number {
    return this.conversations.get(chatId)?.queue.length ?? 0;
  }

  /** Whether a turn is in flight in this chat. */
  isRunning(chatId: string): boolean {
    return this.conversations.get(chatId)?.running != null;
  }

  /**
   * Drop a user's session and cached token after the server rejects it. The
   * next turn mints a fresh token and opens a new socket, rather than retrying
   * a credential the server has already refused.
   */
  invalidateSession(telegramUserId: string): void {
    const session = this.sessions.get(telegramUserId);
    if (!session) {
      return;
    }
    session.dispose();
    session.client.socket.disconnect();
    this.sessions.delete(telegramUserId);
    this.identity.invalidate(telegramUserId);
  }

  /** Close every socket. */
  close(): void {
    for (const session of this.sessions.values()) {
      session.dispose();
      session.client.socket.disconnect();
    }
    this.sessions.clear();
    this.conversations.clear();
    this.byThread.clear();
  }

  // -------------------------------------------------------------------------

  private ensureSession(telegramUserId: string, token: string, userId: string): Session {
    const existing = this.sessions.get(telegramUserId);
    if (existing && existing.token === token && existing.userId === userId) {
      return existing;
    }
    if (existing) {
      // A re-minted token means a new socket: the old one authenticated with
      // a credential that is on its way out.
      existing.dispose();
      existing.client.socket.disconnect();
      this.sessions.delete(telegramUserId);
    }

    const client = this.makeClient({ token, userId });
    const unsubscribers: Array<() => void> = [];
    const session: Session = {
      telegramUserId,
      userId,
      token,
      uid8: userHash8(userId),
      client,
      dispose: () => {
        for (const off of unsubscribers) {
          off();
        }
      },
      recovered: existing?.recovered ?? new Set<string>()
    };
    unsubscribers.push(client.socket.onFrame((frame) => this.handleFrame(session, frame)));
    unsubscribers.push(
      client.socket.onStateChange((state) => {
        if (state === "connected") {
          this.resumeRunningTurns(session);
        }
      })
    );
    client.socket.connect();
    this.sessions.set(telegramUserId, session);
    return session;
  }

  private async ensureConversation(session: Session, chatId: string): Promise<Conversation> {
    let conversation = this.conversations.get(chatId);
    if (!conversation) {
      conversation = {
        chatId,
        telegramUserId: session.telegramUserId,
        threadIndex: 1,
        queue: [],
        running: null,
        chain: Promise.resolve()
      };
      this.conversations.set(chatId, conversation);
    }
    if (session.recovered.has(chatId)) {
      return conversation;
    }
    session.recovered.add(chatId);
    try {
      const ids = await session.client.listThreadIds();
      const highest = highestThreadIndex(ids, chatId, session.uid8);
      if (highest > 0) {
        conversation.threadIndex = highest;
      }
    } catch {
      // The bridge keeps no conversation state, so a failed listing costs the
      // user a new thread, not a broken turn.
    }
    return conversation;
  }

  private startTurn(session: Session, conversation: Conversation, text: string): string {
    const threadId = deriveThreadId(conversation.chatId, session.uid8, conversation.threadIndex);
    const running: RunningTurn = {
      threadId,
      renderer: createRendererState({ editThrottleMs: this.config.editThrottleMs }),
      lastSeq: 0,
      sent: false
    };
    conversation.running = running;
    this.byThread.set(threadId, conversation);

    session.client.socket.send({
      threadId,
      text,
      provider: this.config.provider ?? null,
      model: this.config.model ?? null,
      agentMode: true,
      permissionMode: this.config.permissionMode ?? "auto"
    });
    running.sent = true;
    return threadId;
  }

  private resumeRunningTurns(session: Session): void {
    for (const conversation of this.conversations.values()) {
      if (conversation.telegramUserId !== session.telegramUserId) {
        continue;
      }
      const running = conversation.running;
      if (running === null || !running.sent) {
        continue;
      }
      // The renderer suppresses any replayed frame it has already applied, so
      // asking for one seq too many costs nothing and asking for one too few
      // would lose text.
      session.client.socket.resume(running.threadId, running.lastSeq);
    }
  }

  private handleFrame(session: Session, raw: RenderFrame): void {
    const frame = normalizeFrame(raw);
    const conversation = this.locateConversation(session, frame);
    if (!conversation) {
      return;
    }
    const running = conversation.running;
    if (running === null) {
      return;
    }

    const result = foldFrame(running.renderer, frame, this.now());
    running.renderer = result.state;
    if (typeof result.state.lastSeq === "number") {
      running.lastSeq = result.state.lastSeq;
    }

    if (result.ops.length > 0) {
      const context: DeliveryContext = {
        chatId: conversation.chatId,
        telegramUserId: session.telegramUserId,
        userId: session.userId,
        threadId: running.threadId,
        token: session.token
      };
      this.deliver(conversation, context, result.ops);
    }

    if (result.state.ended) {
      this.finishTurn(session, conversation);
    }
  }

  private locateConversation(session: Session, frame: RenderFrame): Conversation | null {
    const threadId = threadIdOf(frame);
    if (threadId !== null) {
      return this.byThread.get(threadId) ?? null;
    }
    // Frames the server does not stamp with a thread belong to the one turn
    // this user has in flight; with several, guessing would put text in the
    // wrong chat, so nothing is rendered.
    let candidate: Conversation | null = null;
    for (const conversation of this.conversations.values()) {
      if (conversation.telegramUserId !== session.telegramUserId) {
        continue;
      }
      if (conversation.running === null) {
        continue;
      }
      if (candidate !== null) {
        return null;
      }
      candidate = conversation;
    }
    return candidate;
  }

  private deliver(
    conversation: Conversation,
    context: DeliveryContext,
    ops: readonly RenderOp[]
  ): void {
    conversation.chain = conversation.chain.then(async () => {
      try {
        await this.executeOps(context, ops);
      } catch (err) {
        // One failed Bot API call must not stall every later op in the chat.
        console.error("[telegram] failed to deliver render ops:", err);
      }
    });
  }

  private finishTurn(session: Session, conversation: Conversation): void {
    const running = conversation.running;
    if (running !== null) {
      this.byThread.delete(running.threadId);
    }
    conversation.running = null;

    const next = conversation.queue.shift();
    if (next === undefined) {
      return;
    }
    this.startTurn(session, conversation, next.text);
  }
}
