/**
 * tRPC client for the NodeTool backend.
 *
 * Provides a type-safe client for calling tRPC procedures on the server.
 * The server mounts all tRPC routes at /trpc.
 */
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@nodetool/websocket/trpc";
import { BASE_URL } from "../stores/BASE_URL";
import { supabase } from "./supabaseClient";
import { isLocalhost } from "../stores/ApiClient";

async function getAuthHeaders(): Promise<Record<string, string>> {
  if (isLocalhost) {
    return {};
  }
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (session) {
    return { Authorization: `Bearer ${session.access_token}` };
  }
  return {};
}

/**
 * The configured tRPC client instance.
 *
 * Uses httpBatchLink to batch multiple queries in a single HTTP request,
 * improving performance for pages that make many concurrent tRPC calls.
 */
export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${BASE_URL}/trpc`,
      transformer: superjson,
      async headers() {
        return getAuthHeaders();
      }
    })
  ]
});
