/**
 * TelegramAdapter — the only module that knows Telegram (design §3).
 *
 * Two directions meet here. Inbound: `getUpdates` long polling, private-chat
 * and command routing, the unlinked-user prompt, group declines. Outbound: the
 * renderer's ops become Bot API calls, with the platform's two facts of life
 * handled rather than hoped away — 429 `retry_after`, and the parse mode
 * rejecting text, which falls back to plain rather than failing the turn.
 *
 * Ops are executed off a per-chat queue. That queue is what makes superseded
 * edits droppable: while a backoff holds the head of the queue, later edits to
 * the same message pile up behind it, and only the last one is worth sending.
 */

import type { RenderOp } from "./frame-renderer.js";
import type { AssetAttachment } from "./frame-renderer.js";
import type { DeliveryContext } from "./turn-router.js";
import type { TurnRouter } from "./turn-router.js";
import type { BotApi, TelegramCallbackQuery, TelegramMessage, TelegramUpdate } from "./bot-api.js";
import { BotApiError, TELEGRAM_UPLOAD_LIMIT_BYTES } from "./bot-api.js";
import type { CommandDeps, CommandIdentity } from "./commands.js";
import { MESSAGES, handleCommand, isAllowedUser, parseCommand } from "./commands.js";

/** Long-poll seconds asked of `getUpdates`. */
export const POLL_TIMEOUT_SECONDS = 50;

/** Callback data on the inline stop button. */
export const STOP_CALLBACK_DATA = "stop";

/** Bytes of an asset, ready to upload. */
export interface ResolvedAsset {
  readonly bytes: Uint8Array;
  readonly filename: string;
  readonly contentType: string | null;
}

/**
 * Fetch an attachment's bytes on the user's own delegated token. Injected so
 * the adapter's tests never touch the network and the asset-URL scheme stays
 * the client module's business.
 */
export type ResolveAsset = (
  asset: AssetAttachment,
  context: DeliveryContext
) => Promise<ResolvedAsset | null>;

export interface AdapterConfig {
  readonly allowUsers: readonly string[];
  readonly apiUrl: string;
}

export interface TelegramAdapterOptions {
  readonly api: BotApi;
  readonly identity: CommandIdentity;
  readonly router: TurnRouter;
  readonly config: AdapterConfig;
  readonly fetch: typeof fetch;
  /** Sleep, injected so backoff tests do not wait. */
  readonly wait?: (ms: number) => Promise<void>;
  readonly resolveAsset?: ResolveAsset;
  readonly log?: (message: string, detail?: unknown) => void;
}

/** Why the poll loop stopped. */
export type PollStopReason = "stopped" | "conflict" | "fatal";

interface ChatMessages {
  status: number | null;
  stream: number | null;
}

interface QueuedOp {
  readonly op: RenderOp;
  readonly context: DeliveryContext;
}

interface ChatQueue {
  readonly ops: QueuedOp[];
  draining: Promise<void> | null;
}

function defaultWait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPhoto(contentType: string | null, filename: string): boolean {
  if (contentType !== null) {
    return contentType.startsWith("image/") && !contentType.includes("svg");
  }
  return /\.(jpe?g|png|webp)$/i.test(filename);
}

export class TelegramAdapter {
  private readonly api: BotApi;
  private readonly identity: CommandIdentity;
  private readonly router: TurnRouter;
  private readonly config: AdapterConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly wait: (ms: number) => Promise<void>;
  private readonly resolveAsset: ResolveAsset | null;
  private readonly log: (message: string, detail?: unknown) => void;

  private offset = 0;
  private running = false;
  private readonly messages = new Map<string, ChatMessages>();
  private readonly queues = new Map<string, ChatQueue>();
  private readonly declinedGroups = new Set<string>();

  constructor(options: TelegramAdapterOptions) {
    this.api = options.api;
    this.identity = options.identity;
    this.router = options.router;
    this.config = options.config;
    this.fetchImpl = options.fetch;
    this.wait = options.wait ?? defaultWait;
    this.resolveAsset = options.resolveAsset ?? null;
    this.log = options.log ?? ((message, detail) => console.error(message, detail ?? ""));
  }

  /**
   * Long-poll until {@link stop} is called.
   *
   * A 409 means another process holds this bot token's update stream — two
   * consumers silently steal each other's updates, so the loop ends and says
   * so instead of fighting for them.
   */
  async poll(): Promise<PollStopReason> {
    this.running = true;
    while (this.running) {
      let updates: TelegramUpdate[];
      try {
        updates = await this.api.getUpdates(this.offset, POLL_TIMEOUT_SECONDS);
      } catch (err) {
        if (err instanceof BotApiError && err.isConflict) {
          this.log(
            "[telegram] another getUpdates consumer holds this bot token — " +
              "stop the other bridge instance (or delete the webhook) and start again."
          );
          this.running = false;
          return "conflict";
        }
        if (err instanceof BotApiError && err.retryAfterSeconds !== null) {
          await this.wait(err.retryAfterSeconds * 1000);
          continue;
        }
        if (err instanceof BotApiError && err.status === 401) {
          this.log(`[telegram] ${err.message}`);
          this.running = false;
          return "fatal";
        }
        this.log("[telegram] getUpdates failed:", err);
        await this.wait(1000);
        continue;
      }

      for (const update of updates) {
        this.offset = Math.max(this.offset, update.update_id + 1);
        try {
          await this.handleUpdate(update);
        } catch (err) {
          this.log("[telegram] failed to handle update:", err);
        }
      }
    }
    return "stopped";
  }

  /** Ask the poll loop to end after the in-flight request. */
  stop(): void {
    this.running = false;
  }

  /** Wait until every queued op has been executed. */
  async flush(): Promise<void> {
    for (const queue of this.queues.values()) {
      await queue.draining;
    }
  }

  // -------------------------------------------------------------------------
  // Inbound
  // -------------------------------------------------------------------------

  async handleUpdate(update: TelegramUpdate): Promise<void> {
    if (update.callback_query) {
      await this.handleCallbackQuery(update.callback_query);
      return;
    }
    const message = update.message;
    if (message) {
      await this.handleMessage(message);
    }
  }

  private async handleCallbackQuery(query: TelegramCallbackQuery): Promise<void> {
    const chatId = query.message ? String(query.message.chat.id) : null;
    if (query.data !== STOP_CALLBACK_DATA || chatId === null) {
      await this.api.answerCallbackQuery(query.id);
      return;
    }
    const stopped = this.router.stop(chatId);
    await this.api.answerCallbackQuery(query.id, stopped ? MESSAGES.stopping : MESSAGES.nothingRunning);
  }

  private async handleMessage(message: TelegramMessage): Promise<void> {
    const chatId = String(message.chat.id);
    const telegramUserId = message.from ? String(message.from.id) : null;
    if (telegramUserId === null) {
      return;
    }

    if (message.chat.type !== "private") {
      if (!this.declinedGroups.has(chatId)) {
        this.declinedGroups.add(chatId);
        await this.sendPlain(chatId, MESSAGES.groupDecline);
      }
      return;
    }

    if (!isAllowedUser(this.config.allowUsers, telegramUserId)) {
      await this.sendPlain(chatId, MESSAGES.notAllowed);
      return;
    }

    const text = message.text ?? message.caption ?? "";
    const command = text.length > 0 ? parseCommand(text, message.entities) : null;
    if (command !== null) {
      const outcome = await handleCommand(this.commandDeps(), {
        command: command.command,
        args: command.args,
        chatId,
        telegramUserId
      });
      for (const reply of outcome.replies) {
        await this.sendPlain(chatId, reply);
      }
      return;
    }

    if (text.length === 0) {
      await this.sendPlain(chatId, MESSAGES.unsupportedMedia);
      return;
    }

    const result = await this.router.submit({ telegramUserId, chatId, text });
    if (result.status === "unlinked") {
      await this.sendPlain(
        chatId,
        result.reason === "local-mode" ? result.message : MESSAGES.linkPrompt
      );
      return;
    }
    if (result.status === "busy") {
      await this.sendPlain(chatId, MESSAGES.busy);
    }
  }

  private commandDeps(): CommandDeps {
    return {
      identity: this.identity,
      router: this.router,
      apiUrl: this.config.apiUrl,
      fetch: this.fetchImpl,
      allowUsers: this.config.allowUsers
    };
  }

  // -------------------------------------------------------------------------
  // Outbound
  // -------------------------------------------------------------------------

  /**
   * Accept a batch of render ops for delivery. Returns once the ops are
   * queued; the per-chat drain loop executes them in order.
   */
  executeOps = (context: DeliveryContext, ops: readonly RenderOp[]): void => {
    const queue = this.queueFor(context.chatId);
    for (const op of ops) {
      queue.ops.push({ op, context });
    }
    if (queue.draining === null) {
      queue.draining = this.drain(context.chatId, queue).finally(() => {
        queue.draining = null;
      });
    }
  };

  private queueFor(chatId: string): ChatQueue {
    let queue = this.queues.get(chatId);
    if (!queue) {
      queue = { ops: [], draining: null };
      this.queues.set(chatId, queue);
    }
    return queue;
  }

  private async drain(chatId: string, queue: ChatQueue): Promise<void> {
    while (queue.ops.length > 0) {
      const entry = queue.ops.shift();
      if (entry === undefined) {
        return;
      }
      if (this.isSuperseded(entry.op, queue)) {
        continue;
      }
      try {
        await this.executeOne(chatId, entry);
      } catch (err) {
        if (err instanceof BotApiError && err.retryAfterSeconds !== null) {
          await this.wait(err.retryAfterSeconds * 1000);
          // Re-queue at the head; the supersede check runs again, so a newer
          // edit of the same message wins over this one.
          queue.ops.unshift(entry);
          continue;
        }
        this.log("[telegram] render op failed:", err);
      }
    }
  }

  /** An intermediate edit nothing will see, because a later one is queued. */
  private isSuperseded(op: RenderOp, queue: ChatQueue): boolean {
    if (op.kind !== "edit") {
      return false;
    }
    return queue.ops.some(
      (entry) =>
        (entry.op.kind === "edit" || entry.op.kind === "finalize") &&
        entry.op.target === op.target
    );
  }

  private async executeOne(chatId: string, entry: QueuedOp): Promise<void> {
    const { op, context } = entry;
    const state = this.messagesFor(chatId);

    switch (op.kind) {
      case "typing":
        await this.api.sendChatAction(chatId, "typing");
        return;

      case "send": {
        const sent = await this.send(chatId, op.text, op.parseMode, op.target === "status");
        state[op.target] = sent;
        return;
      }

      case "edit": {
        const messageId = state[op.target];
        if (messageId === null) {
          state[op.target] = await this.send(chatId, op.text, op.parseMode, op.target === "status");
          return;
        }
        await this.edit(chatId, messageId, op.text, op.parseMode);
        return;
      }

      case "finalize": {
        const messageId = state[op.target];
        if (op.create || messageId === null) {
          await this.send(chatId, op.text, op.parseMode, false);
        } else {
          await this.edit(chatId, messageId, op.text, op.parseMode);
        }
        state[op.target] = null;
        return;
      }

      case "stop-note":
        await this.sendPlain(chatId, op.text);
        return;

      case "attach":
        await this.attach(chatId, op.asset, context);
        return;

      default:
        return;
    }
  }

  private messagesFor(chatId: string): ChatMessages {
    let state = this.messages.get(chatId);
    if (!state) {
      state = { status: null, stream: null };
      this.messages.set(chatId, state);
    }
    return state;
  }

  private async send(
    chatId: string,
    text: string,
    parseMode: "html" | "none",
    withStopButton: boolean
  ): Promise<number> {
    const payload: Record<string, unknown> = { chat_id: chatId, text };
    if (parseMode === "html") {
      payload.parse_mode = "HTML";
    }
    if (withStopButton) {
      payload.reply_markup = {
        inline_keyboard: [[{ text: "⏹ Stop", callback_data: STOP_CALLBACK_DATA }]]
      };
    }
    try {
      const sent = await this.api.sendMessage(payload);
      return sent.message_id;
    } catch (err) {
      if (err instanceof BotApiError && err.isParseFailure) {
        delete payload.parse_mode;
        const sent = await this.api.sendMessage(payload);
        return sent.message_id;
      }
      throw err;
    }
  }

  private async edit(
    chatId: string,
    messageId: number,
    text: string,
    parseMode: "html" | "none"
  ): Promise<void> {
    const payload: Record<string, unknown> = {
      chat_id: chatId,
      message_id: messageId,
      text
    };
    if (parseMode === "html") {
      payload.parse_mode = "HTML";
    }
    try {
      await this.api.editMessageText(payload);
    } catch (err) {
      if (err instanceof BotApiError && err.isUnmodified) {
        // The message already shows this text; nothing to do.
        return;
      }
      if (err instanceof BotApiError && err.isParseFailure) {
        delete payload.parse_mode;
        await this.api.editMessageText(payload);
        return;
      }
      throw err;
    }
  }

  private async sendPlain(chatId: string, text: string): Promise<void> {
    await this.api.sendMessage({ chat_id: chatId, text });
  }

  private async attach(
    chatId: string,
    asset: AssetAttachment,
    context: DeliveryContext
  ): Promise<void> {
    if (this.resolveAsset === null) {
      await this.sendPlain(chatId, `📎 ${asset.name ?? asset.uri}`);
      return;
    }
    const resolved = await this.resolveAsset(asset, context);
    if (resolved === null) {
      await this.sendPlain(chatId, `📎 ${asset.name ?? asset.uri}`);
      return;
    }
    if (resolved.bytes.byteLength > TELEGRAM_UPLOAD_LIMIT_BYTES) {
      await this.sendPlain(chatId, `📎 too large for Telegram: ${asset.uri}`);
      return;
    }

    const photo = isPhoto(resolved.contentType, resolved.filename);
    const form = new FormData();
    form.append("chat_id", chatId);
    form.append(
      photo ? "photo" : "document",
      new Blob([resolved.bytes as BlobPart], {
        type: resolved.contentType ?? "application/octet-stream"
      }),
      resolved.filename
    );
    await this.api.callMultipart(photo ? "sendPhoto" : "sendDocument", form);
  }
}
