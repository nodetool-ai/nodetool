import { createTRPCReact } from "@trpc/react-query";
import {
  createTRPCClient,
  httpBatchLink,
  loggerLink,
  type TRPCClientErrorLike
} from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@nodetool/websocket/trpc";
import { BASE_URL } from "../stores/BASE_URL";
import { isLocalhost } from "../lib/env";
import { supabase } from "../lib/supabaseClient";

export const trpc = createTRPCReact<AppRouter>();

async function authHeaders(): Promise<Record<string, string>> {
  if (isLocalhost) return {};
  const {
    data: { session }
  } = await supabase.auth.getSession();
  return session ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export function createTRPCHttpClient() {
  return createTRPCClient<AppRouter>({
    links: [
      loggerLink({
        enabled: (opts) =>
          (typeof window !== "undefined" &&
            import.meta.env.DEV &&
            typeof window !== "undefined") ||
          (opts.direction === "down" && opts.result instanceof Error)
      }),
      httpBatchLink({
        url: `${BASE_URL}/trpc`,
        transformer: superjson,
        async headers() {
          return authHeaders();
        }
      })
    ]
  });
}

/**
 * Singleton vanilla tRPC client for use in Zustand stores and other non-React
 * contexts. React components should use the `trpc` React-query client instead.
 */
export const trpcClient = createTRPCHttpClient();

export type TRPCClientError = TRPCClientErrorLike<AppRouter>;
