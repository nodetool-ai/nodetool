import { useState, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { trpc } from "./client";
import { queryClient } from "../queryClient";
import { createTrpcLinks } from "./links";

export function TRPCProvider({ children }: { children: ReactNode }) {
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: createTrpcLinks()
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
