import { createTRPCReact } from "@trpc/react-query";
import {
  createTRPCClient,
  type TRPCClient
} from "@trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@nodetool-ai/websocket/trpc";
import { createTrpcLinks } from "./links";

export type RouterOutputs = inferRouterOutputs<AppRouter>;

export const trpc = createTRPCReact<AppRouter>();

export function createTRPCHttpClient(): Readonly<TRPCClient<AppRouter>> {
  return createTRPCClient<AppRouter>({
    links: createTrpcLinks()
  });
}

/**
 * Singleton vanilla tRPC client for use in Zustand stores and other non-React
 * contexts. React components should use the `trpc` React-query client instead.
 */
export const trpcClient = createTRPCHttpClient();
