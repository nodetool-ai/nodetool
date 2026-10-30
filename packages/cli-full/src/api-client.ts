/**
 * The one tRPC client the CLI talks to a NodeTool server with.
 *
 * `methodOverride: "POST"` keeps the batched input in the request body instead
 * of the URL, so large batches stay under reverse-proxy URL-length limits.
 * See #3979.
 */

import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { TRPCClient } from "@trpc/client";
import { TRPC_MAX_BATCH_SIZE } from "@nodetool-ai/protocol";
import type { AppRouter } from "@nodetool-ai/websocket/trpc";

export function createApiClient(apiUrl: string): TRPCClient<AppRouter> {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${apiUrl}/trpc`,
        maxItems: TRPC_MAX_BATCH_SIZE,
        methodOverride: "POST"
      })
    ]
  });
}

export type ApiClient = TRPCClient<AppRouter>;
