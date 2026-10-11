import {
  httpBatchLink,
  httpLink,
  loggerLink,
  splitLink,
  type TRPCLink
} from "@trpc/client";
import { TRPC_MAX_BATCH_SIZE } from "@nodetool-ai/protocol";
import type { AppRouter } from "@nodetool-ai/websocket/trpc";
import { isAuthRequired } from "../lib/runtimeConfig";
import { supabase } from "../lib/supabaseClient";
import { BASE_URL } from "../stores/BASE_URL";

async function authHeaders(): Promise<Record<string, string>> {
  if (!isAuthRequired()) return {};
  const {
    data: { session }
  } = await supabase.auth.getSession();
  return session ? { Authorization: `Bearer ${session.access_token}` } : {};
}

/**
 * Shared React and vanilla tRPC transport policy.
 *
 * Queries issued in the same tick share one HTTP request, and a batched
 * response arrives only when its slowest procedure finishes. A query that
 * must not wait on its neighbours passes `context: { skipBatch: true }` and
 * goes out as its own request.
 */
export function createTrpcLinks(): TRPCLink<AppRouter>[] {
  const url = `${BASE_URL}/trpc`;
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
        headers: authHeaders
      }),
      false: httpBatchLink({
        url,
        maxItems: TRPC_MAX_BATCH_SIZE,
        methodOverride: "POST",
        headers: authHeaders
      })
    })
  ];
}
