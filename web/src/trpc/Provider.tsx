import { useState, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, loggerLink } from "@trpc/client";
import { trpc } from "./client";
import { isAuthRequired } from "../lib/runtimeConfig";
import { supabase } from "../lib/supabaseClient";
import { queryClient } from "../queryClient";
import { BASE_URL } from "../stores/BASE_URL";

async function authHeaders(): Promise<Record<string, string>> {
  if (!isAuthRequired()) return {};
  const {
    data: { session }
  } = await supabase.auth.getSession();
  return session ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export function TRPCProvider({ children }: { children: ReactNode }) {
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        loggerLink({
          enabled: (opts) =>
            (import.meta.env.DEV && typeof window !== "undefined") ||
            (opts.direction === "down" && opts.result instanceof Error)
        }),
        httpBatchLink({
          url: `${BASE_URL}/trpc`,
          // Force batches to POST so the (potentially long) batched input rides
          // in the request body instead of the URL. GET batches encode every
          // procedure's input into the query string, which reverse proxies
          // (e.g. Tailscale Serve) reject once the URL grows too long,
          // returning 502 and leaving panels empty. See issue #3979.
          methodOverride: "POST",
          async headers() {
            return authHeaders();
          }
        })
      ]
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
