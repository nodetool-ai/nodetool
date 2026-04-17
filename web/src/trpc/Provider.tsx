import { useState, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, loggerLink } from "@trpc/client";
import superjson from "superjson";
import { trpc } from "./client";
import { queryClient } from "../queryClient";
import { BASE_URL } from "../stores/BASE_URL";
import { supabase } from "../lib/supabaseClient";
import { isLocalhost } from "../stores/ApiClient";

async function authHeaders(): Promise<Record<string, string>> {
  if (isLocalhost) return {};
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
          transformer: superjson,
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
