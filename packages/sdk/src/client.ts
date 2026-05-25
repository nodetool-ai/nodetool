import {
  createTRPCClient,
  httpBatchLink,
  type CreateTRPCClient
} from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@nodetool-ai/websocket/trpc";
import { ChatSocket, type WebSocketCtor } from "./chat.js";

export interface CreateNodetoolClientOptions {
  /** Server base URL, e.g. `http://localhost:7777`. */
  baseUrl: string;
  /**
   * Optional bearer token. Sent as `Authorization: Bearer <token>` on every
   * tRPC and REST call, and appended as `?token=<token>` on the chat WebSocket.
   */
  authToken?: string | null;
  /**
   * Override `fetch`. Defaults to the global `fetch`. Pass a wrapped fetch to
   * inject extra headers, observability, etc.
   */
  fetch?: typeof fetch;
  /**
   * `WebSocket` constructor for environments without a global one (e.g. Node).
   * Browsers: leave undefined to use the built-in `WebSocket`.
   * Node 18+: pass `WebSocket` from the `ws` package.
   */
  WebSocket?: WebSocketCtor;
}

export interface NodetoolClient {
  /** Server base URL. */
  readonly baseUrl: string;
  /** Auth token used for new sockets and tRPC calls. */
  readonly authToken: string | null;
  /**
   * Typed tRPC client covering the full {@link AppRouter} surface
   * (threads, messages, models, workflows, jobs, assets, settings, …).
   */
  readonly trpc: CreateTRPCClient<AppRouter>;
  /**
   * Open a new chat WebSocket.  The returned {@link ChatSocket} is an
   * event emitter for `chunk` / `message` / `tool_call` / `error` frames
   * and exposes `send()` and `stop()` for outbound commands.
   *
   * Multiple chat sockets can be opened against the same client — typical use
   * is one-per-active-thread.
   */
  chat(): ChatSocket;
  /**
   * Convenience helper: list every LLM model from every provider that
   * advertises the `generate_message` capability and is configured for the
   * current user. Output is a flat list with `{ id, name, provider }`.
   */
  listLanguageModels(): Promise<
    Array<{ id: string; name: string; provider: string }>
  >;
}

function trimTrailingSlash(s: string): string {
  return s.endsWith("/") ? s.slice(0, -1) : s;
}

function defaultFetch(): typeof fetch {
  if (typeof fetch === "undefined") {
    throw new Error(
      "No global `fetch` available — pass `fetch` in CreateNodetoolClientOptions"
    );
  }
  return fetch;
}

export function createNodetoolClient(
  options: CreateNodetoolClientOptions
): NodetoolClient {
  const baseUrl = trimTrailingSlash(options.baseUrl);
  const authToken = options.authToken ?? null;
  const fetchImpl = options.fetch ?? defaultFetch();

  const trpc: CreateTRPCClient<AppRouter> = createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${baseUrl}/trpc`,
        transformer: superjson,
        fetch: fetchImpl as typeof fetch,
        headers() {
          return authToken ? { Authorization: `Bearer ${authToken}` } : {};
        }
      })
    ]
  });

  const wsUrl =
    baseUrl.replace(/^http(s?):\/\//, (_, s) => `ws${s}://`) + "/ws";

  return {
    baseUrl,
    authToken,
    trpc,
    chat() {
      return new ChatSocket({
        url: wsUrl,
        authToken,
        WebSocket: options.WebSocket
      });
    },
    async listLanguageModels() {
      const providers = await trpc.models.providers.query();
      const llmProviders = providers.filter((p) =>
        p.capabilities.includes("generate_message")
      );
      const groups = await Promise.all(
        llmProviders.map(async (p) => {
          try {
            const models = await trpc.models.llmByProvider.query({
              provider: p.provider
            });
            return models.map((m) => ({
              id: m.id ?? m.name,
              name: m.name ?? m.id,
              provider: p.provider
            }));
          } catch {
            return [] as Array<{ id: string; name: string; provider: string }>;
          }
        })
      );
      return groups.flat();
    }
  };
}
