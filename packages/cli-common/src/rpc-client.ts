import { createTRPCUntypedClient, httpBatchLink } from "@trpc/client";
import { TRPC_MAX_BATCH_SIZE } from "@nodetool-ai/protocol";

/** Share the existing tRPC transport while each domain validates its own response contract. */
export function createRpcClient(
  apiUrl: string
): ReturnType<typeof createTRPCUntypedClient> {
  return createTRPCUntypedClient({
    links: [
      httpBatchLink({
        url: `${apiUrl}/trpc`,
        maxItems: TRPC_MAX_BATCH_SIZE,
        methodOverride: "POST"
      })
    ]
  });
}
