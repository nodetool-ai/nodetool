import { httpBatchLink, loggerLink, type TRPCLink } from "@trpc/client";
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

/** Shared React and vanilla tRPC transport policy. */
export function createTrpcLinks(): TRPCLink<AppRouter>[] {
  return [
    loggerLink({
      enabled: (options) =>
        (typeof window !== "undefined" && import.meta.env.DEV) ||
        (options.direction === "down" && options.result instanceof Error)
    }),
    httpBatchLink({
      url: `${BASE_URL}/trpc`,
      maxItems: TRPC_MAX_BATCH_SIZE,
      methodOverride: "POST",
      headers: authHeaders
    })
  ];
}
