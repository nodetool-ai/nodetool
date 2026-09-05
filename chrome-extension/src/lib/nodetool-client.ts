/**
 * NodeTool server client for the side panel.
 *
 * A trimmed mirror of `packages/sdk/src/client.ts`. The SDK builds its tRPC
 * caller with `@trpc/client` and types it against `AppRouter` from
 * `@nodetool-ai/websocket`; the extension is outside the npm workspace and can
 * import neither, so the handful of procedures the chat UI needs are called
 * over plain `fetch` against the same `/trpc` mount, with their inputs and
 * outputs declared here.
 *
 * The server's tRPC instance is created with no data transformer
 * (`packages/websocket/src/trpc/index.ts`), so a single-procedure call is the
 * unbatched HTTP shape: `GET /trpc/<path>?input=<json>` for a query,
 * `POST /trpc/<path>` with the input as the body for a mutation, and
 * `{ result: { data } }` or `{ error: { message } }` coming back.
 */

import { ChatSocket, type ChatSocketOptions } from "./chat-socket.js";

/** One conversation, as `threads.list` returns it. */
export interface ThreadSummary {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

/** One persisted turn, as `messages.list` returns it. */
export interface StoredMessage {
  id?: string | null;
  role: string;
  content?: unknown;
  name?: string | null;
  tool_calls?: unknown[] | null;
  created_at?: string | null;
}

/** A language model the picker can offer. */
export interface LanguageModelOption {
  id: string;
  name: string;
  provider: string;
}

interface ProviderInfo {
  provider: string;
  capabilities: string[];
  display_name: string;
}

/** The tRPC envelope, before `result.data` is narrowed to a procedure's output. */
interface TrpcEnvelope {
  result?: { data?: unknown };
  error?: { message?: string };
}

export interface NodetoolClientOptions {
  /** Server base URL, e.g. `http://localhost:7777`. */
  baseUrl: string;
  /**
   * Optional bearer token. Sent as `Authorization: Bearer <token>` on every
   * tRPC call, and appended as `?token=<token>` on the chat WebSocket. A local
   * server reached over loopback needs none — it maps the request to user "1".
   */
  authToken?: string | null;
}

export class NodetoolApiError extends Error {
  constructor(
    message: string,
    readonly procedure: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "NodetoolApiError";
  }
}

export class NodetoolClient {
  readonly baseUrl: string;
  readonly authToken: string | null;

  constructor(options: NodetoolClientOptions) {
    this.baseUrl = trimTrailingSlash(options.baseUrl);
    this.authToken = options.authToken?.trim() ? options.authToken.trim() : null;
  }

  /** Open a chat WebSocket against this server's unified `/ws` endpoint. */
  chat(overrides?: Partial<ChatSocketOptions>): ChatSocket {
    return new ChatSocket({
      url: this.baseUrl.replace(/^http(s?):\/\//, (_, s: string) => `ws${s}://`) + "/ws",
      authToken: this.authToken,
      ...overrides,
    });
  }

  listThreads(limit = 100): Promise<{ threads: ThreadSummary[] }> {
    return this.query<{ threads: ThreadSummary[] }>("threads.list", { limit });
  }

  deleteThread(id: string): Promise<{ ok: true }> {
    return this.mutate<{ ok: true }>("threads.delete", { id });
  }

  listMessages(
    threadId: string,
    limit = 100,
  ): Promise<{ messages: StoredMessage[] }> {
    return this.query<{ messages: StoredMessage[] }>("messages.list", {
      thread_id: threadId,
      limit,
    });
  }

  /**
   * Every LLM from every provider that advertises `generate_message` and is
   * configured for the current user, flattened to `{ id, name, provider }`.
   * A provider that fails to enumerate is skipped rather than failing the
   * whole picker — one missing API key should not empty the list.
   */
  async listLanguageModels(): Promise<LanguageModelOption[]> {
    const providers = await this.query<ProviderInfo[]>("models.providers", {});
    const llmProviders = providers.filter((p) =>
      p.capabilities.includes("generate_message"),
    );
    const groups = await Promise.all(
      llmProviders.map(async (p) => {
        try {
          const models = await this.query<Array<{ id?: string; name?: string }>>(
            "models.llmByProvider",
            { provider: p.provider },
          );
          return models.map((m) => ({
            id: m.id ?? m.name ?? "",
            name: m.name ?? m.id ?? "",
            provider: p.provider,
          }));
        } catch {
          return [];
        }
      }),
    );
    return groups.flat().filter((m) => m.id.length > 0);
  }

  private async query<T>(
    procedure: string,
    input: Record<string, unknown>,
  ): Promise<T> {
    const search = new URLSearchParams({ input: JSON.stringify(input) });
    return this.call<T>(procedure, `${this.trpcUrl(procedure)}?${search}`, {
      method: "GET",
    });
  }

  private async mutate<T>(
    procedure: string,
    input: Record<string, unknown>,
  ): Promise<T> {
    return this.call<T>(procedure, this.trpcUrl(procedure), {
      method: "POST",
      body: JSON.stringify(input),
      headers: { "content-type": "application/json" },
    });
  }

  private trpcUrl(procedure: string): string {
    return `${this.baseUrl}/trpc/${procedure}`;
  }

  private async call<T>(
    procedure: string,
    url: string,
    init: RequestInit,
  ): Promise<T> {
    const headers = new Headers(init.headers);
    if (this.authToken) {
      headers.set("authorization", `Bearer ${this.authToken}`);
    }

    let response: Response;
    try {
      response = await fetch(url, { ...init, headers });
    } catch (err) {
      throw new NodetoolApiError(
        `Cannot reach ${this.baseUrl}: ${err instanceof Error ? err.message : String(err)}`,
        procedure,
        0,
      );
    }

    const envelope = (await response.json().catch(() => null)) as
      | TrpcEnvelope
      | null;
    if (!response.ok || envelope?.error) {
      throw new NodetoolApiError(
        envelope?.error?.message ?? `HTTP ${response.status}`,
        procedure,
        response.status,
      );
    }
    return (envelope?.result?.data ?? null) as T;
  }
}

function trimTrailingSlash(s: string): string {
  return s.endsWith("/") ? s.slice(0, -1) : s;
}
