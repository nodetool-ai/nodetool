/**
 * The Bot API surface the bridge uses — eight methods over `fetch`, no SDK
 * (design §13). Everything HTTP about Telegram lives here: the URL shape, the
 * `{ok, result, description}` envelope, and the two failures that are routine
 * rather than exceptional (429 with `retry_after`, and 400 for text the parse
 * mode rejects).
 */

/** Base URL of the Bot API. Overridable so tests never resolve a real host. */
export const TELEGRAM_API_BASE = "https://api.telegram.org";

/** Max upload the Bot API accepts from a bot. */
export const TELEGRAM_UPLOAD_LIMIT_BYTES = 50 * 1024 * 1024;

export interface BotApiOptions {
  readonly botToken: string;
  readonly fetch: typeof fetch;
  /** Defaults to {@link TELEGRAM_API_BASE}. */
  readonly baseUrl?: string;
}

/** A Bot API call that answered `ok: false` or a non-2xx status. */
export class BotApiError extends Error {
  readonly method: string;
  readonly status: number;
  readonly description: string;
  /** Seconds Telegram asked the bot to wait, when it answered 429. */
  readonly retryAfterSeconds: number | null;

  constructor(init: {
    method: string;
    status: number;
    description: string;
    retryAfterSeconds: number | null;
  }) {
    super(`Telegram ${init.method} failed (${init.status}): ${init.description}`);
    this.name = "BotApiError";
    this.method = init.method;
    this.status = init.status;
    this.description = init.description;
    this.retryAfterSeconds = init.retryAfterSeconds;
  }

  /** The text was rejected by the parse mode; resending unparsed will work. */
  get isParseFailure(): boolean {
    return this.status === 400 && /can't parse entities/i.test(this.description);
  }

  /** An edit whose text equals what the message already shows. */
  get isUnmodified(): boolean {
    return this.status === 400 && /message is not modified/i.test(this.description);
  }

  /** Another `getUpdates` consumer holds the bot token. */
  get isConflict(): boolean {
    return this.status === 409;
  }
}

/** A Telegram message, narrowed to the fields the bridge reads. */
export interface TelegramMessage {
  readonly message_id: number;
  readonly text?: string;
  readonly caption?: string;
  readonly date?: number;
  readonly chat: { readonly id: number; readonly type: string };
  readonly from?: { readonly id: number; readonly username?: string; readonly first_name?: string };
  readonly entities?: readonly { readonly type: string; readonly offset: number; readonly length: number }[];
  readonly photo?: readonly unknown[];
  readonly document?: unknown;
  readonly voice?: unknown;
  readonly audio?: unknown;
  readonly video?: unknown;
}

export interface TelegramCallbackQuery {
  readonly id: string;
  readonly data?: string;
  readonly from: { readonly id: number };
  readonly message?: {
    readonly message_id: number;
    readonly chat: { readonly id: number; readonly type: string };
  };
}

export interface TelegramUpdate {
  readonly update_id: number;
  readonly message?: TelegramMessage;
  readonly edited_message?: TelegramMessage;
  readonly callback_query?: TelegramCallbackQuery;
}

/** One command as `setMyCommands` takes it. */
export interface BotCommandSpec {
  readonly command: string;
  readonly description: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRetryAfter(body: unknown): number | null {
  if (!isRecord(body)) {
    return null;
  }
  const parameters = body.parameters;
  if (!isRecord(parameters)) {
    return null;
  }
  const value = parameters.retry_after;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readDescription(body: unknown, fallback: string): string {
  if (isRecord(body) && typeof body.description === "string" && body.description.length > 0) {
    return body.description;
  }
  return fallback;
}

/** Raw Bot API client. One method per call the bridge makes. */
export class BotApi {
  private readonly botToken: string;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;

  constructor(options: BotApiOptions) {
    this.botToken = options.botToken;
    this.fetchImpl = options.fetch;
    this.baseUrl = (options.baseUrl ?? TELEGRAM_API_BASE).replace(/\/+$/, "");
  }

  /** Call a Bot API method with a JSON body. */
  async call<T = unknown>(method: string, payload: Record<string, unknown>): Promise<T> {
    const response = await this.fetchImpl(this.url(method), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    return this.unwrap<T>(method, response);
  }

  /** Call a Bot API method with a multipart body, for file uploads. */
  async callMultipart<T = unknown>(method: string, form: FormData): Promise<T> {
    const response = await this.fetchImpl(this.url(method), { method: "POST", body: form });
    return this.unwrap<T>(method, response);
  }

  /**
   * Long-poll for updates. `timeout` is the Bot API's own long-poll seconds,
   * so the request itself blocks rather than the bridge spinning.
   */
  getUpdates(offset: number, timeoutSeconds: number): Promise<TelegramUpdate[]> {
    return this.call<TelegramUpdate[]>("getUpdates", {
      offset,
      timeout: timeoutSeconds,
      allowed_updates: ["message", "callback_query"]
    });
  }

  sendMessage(payload: Record<string, unknown>): Promise<TelegramMessage> {
    return this.call<TelegramMessage>("sendMessage", payload);
  }

  editMessageText(payload: Record<string, unknown>): Promise<unknown> {
    return this.call("editMessageText", payload);
  }

  sendChatAction(chatId: string, action: string): Promise<unknown> {
    return this.call("sendChatAction", { chat_id: chatId, action });
  }

  answerCallbackQuery(callbackQueryId: string, text?: string): Promise<unknown> {
    const payload: Record<string, unknown> = { callback_query_id: callbackQueryId };
    if (text !== undefined) {
      payload.text = text;
    }
    return this.call("answerCallbackQuery", payload);
  }

  setMyCommands(commands: readonly BotCommandSpec[]): Promise<unknown> {
    return this.call("setMyCommands", { commands });
  }

  getMe(): Promise<{ id: number; username?: string }> {
    return this.call<{ id: number; username?: string }>("getMe", {});
  }

  private url(method: string): string {
    return `${this.baseUrl}/bot${this.botToken}/${method}`;
  }

  private async unwrap<T>(method: string, response: Response): Promise<T> {
    const text = await response.text();
    let body: unknown = null;
    if (text.length > 0) {
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        // Telegram answers JSON; anything else is a proxy in the way, and the
        // status is then the only signal.
        body = null;
      }
    }
    if (!response.ok || !(isRecord(body) && body.ok === true)) {
      throw new BotApiError({
        method,
        status: response.status,
        description: readDescription(body, text.slice(0, 200) || response.statusText),
        retryAfterSeconds: readRetryAfter(body)
      });
    }
    return body.result as T;
  }
}
