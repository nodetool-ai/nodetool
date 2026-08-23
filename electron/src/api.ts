import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@nodetool-ai/websocket/trpc";
import { TRPC_MAX_BATCH_SIZE } from "@nodetool-ai/protocol";
import { Workflow } from "./types";
import { logMessage } from "./logger";
import { getServerUrl } from "./utils";

function createApiClient() {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: getServerUrl("/trpc"),
        maxItems: TRPC_MAX_BATCH_SIZE,
        // POST keeps the batched input in the request body instead of the URL,
        // so large batches stay under reverse-proxy URL-length limits. See #3979.
        methodOverride: "POST"
      })
    ]
  });
}

/**
 * Fetches workflows from the server via tRPC.
 * Returns [] on any failure — callers (tray, shortcuts) treat empty lists as
 * "server not ready yet" which is common at app startup.
 */
export async function fetchWorkflows(): Promise<Workflow[]> {
  logMessage("Fetching workflows from server...");
  try {
    const data = await createApiClient().workflows.list.query({ limit: 100 });
    const count = data.workflows.length;
    logMessage(`Successfully fetched ${count} workflows`);
    // SAFETY: the server always sends a graph whose nodes carry `data`, but
    // the wire schema declares `graph` nullable and lets `data` ride in on a
    // catchall, so the row type and this module's `Workflow` do not overlap.
    // `getInputNodes` dereferences both unconditionally.
    return data.workflows as unknown as Workflow[];
  } catch (error) {
    if (error instanceof Error) {
      logMessage(`Failed to fetch workflows: ${error.message}`, "error");
    }
    return [];
  }
}
