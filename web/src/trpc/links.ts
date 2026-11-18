import {
  httpBatchLink,
  httpLink,
  loggerLink,
  splitLink,
  type TRPCLink
} from "@trpc/client";
import { TRPC_MAX_BATCH_SIZE } from "@nodetool-ai/protocol";
import {
  SYNC_PROTOCOL_HEADER,
  SYNC_PROTOCOL_VERSION
} from "@nodetool-ai/protocol/api-schemas/sync.js";
import type { AppRouter } from "@nodetool-ai/websocket/trpc";
import { isAuthRequired } from "../lib/runtimeConfig";
import { authHeader } from "../lib/auth";
import { BASE_URL } from "../stores/BASE_URL";

/**
 * The auth header, and the sync protocol version: a request without it is
 * read as a legacy client, whose saves are in the legacy schema.
 */
async function requestHeaders(): Promise<Record<string, string>> {
  const protocol = { [SYNC_PROTOCOL_HEADER]: String(SYNC_PROTOCOL_VERSION) };
  if (!isAuthRequired()) return protocol;
  return { ...(await authHeader()), ...protocol };
}

/** Where the links send, and how. The cloud client passes its own. */
export interface TrpcTransport {
  url: string;
  headers: () => Promise<Record<string, string>> | Record<string, string>;
  fetch?: typeof fetch;
}

/** The sync protocol header alone, for a server that gets its credential elsewhere. */
export function syncProtocolHeaders(): Record<string, string> {
  return { [SYNC_PROTOCOL_HEADER]: String(SYNC_PROTOCOL_VERSION) };
}

/**
 * Shared React and vanilla tRPC transport policy.
 *
 * Queries issued in the same tick share one HTTP request, and a batched
 * response arrives only when its slowest procedure finishes. A query that
 * must not wait on its neighbours passes `context: { skipBatch: true }` and
 * goes out as its own request.
 */
export function createTrpcLinks(
  transport: TrpcTransport = {
    url: `${BASE_URL}/trpc`,
    headers: requestHeaders
  }
): TRPCLink<AppRouter>[] {
  const { url, headers, fetch } = transport;
  return [
    loggerLink({
      enabled: (options) =>
        (typeof window !== "undefined" && import.meta.env.DEV) ||
        (options.direction === "down" && options.result instanceof Error)
    }),
    splitLink({
      condition: (op) => op.context.skipBatch === true,
      true: httpLink({
        url,
        methodOverride: "POST",
        headers,
        fetch
      }),
      false: httpBatchLink({
        url,
        maxItems: TRPC_MAX_BATCH_SIZE,
        methodOverride: "POST",
        headers,
        fetch
      })
    })
  ];
}
