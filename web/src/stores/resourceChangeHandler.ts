/**
 * Resource Change Handler
 *
 * Handles database resource change notifications (create/update/delete)
 * from the WebSocket and invalidates TanStack Query caches accordingly.
 *
 * This enables real-time synchronization of the client state with the backend
 * database without requiring manual cache invalidation or polling.
 */
import { queryClient } from "../queryClient";
import { ResourceChangeUpdate } from "./ApiTypes";
import { loadMetadata } from "../serverState/useMetadata";

/**
 * Mapping of resource types to their TanStack Query cache keys.
 * When a resource change event is received, all associated query keys
 * will be invalidated to trigger refetch.
 */
const RESOURCE_TYPE_TO_QUERY_KEYS: Record<string, string[]> = {
  workflow: ["workflows", "templates"],
  job: ["jobs"],
  asset: ["assets"],
  thread: ["threads"],
  collection: ["collections"],
  workspace: ["workspaces"],
  secret: ["secrets"],
  metadata: ["metadata"]
  // Add more mappings as needed
};

const PROVIDER_QUERY_KEYS = ["providers"] as const;
const MODEL_QUERY_KEYS = [
  "models",
  "language-models",
  "embedding-models",
  "image-models",
  "tts-models",
  "asr-models",
  "video-models",
  "allModels"
] as const;

function invalidateQueryKeys(keys: readonly string[]): void {
  keys.forEach((queryKey) => {
    console.debug(`[ResourceChange] Invalidating query cache: [${queryKey}]`);
    queryClient.invalidateQueries({ queryKey: [queryKey] });
  });
}

/**
 * Handle resource change notifications from the WebSocket.
 *
 * @param update - The resource change update message
 */
export function handleResourceChange(update: ResourceChangeUpdate): void {
  const { event, resource_type, resource } = update;

  console.info(`[ResourceChange] Received update: ${event} ${resource_type}`, {
    id: resource.id,
    etag: resource.etag
  });

  // Special handling for metadata changes (e.g. Python bridge nodes registered)
  if (resource_type === "metadata") {
    console.info("[ResourceChange] Reloading node metadata");
    void loadMetadata();
    invalidateQueryKeys(["metadata"]);
    return;
  }

  if (resource_type === "provider") {
    console.info("[ResourceChange] Invalidating provider and model queries");
    invalidateQueryKeys([...PROVIDER_QUERY_KEYS, ...MODEL_QUERY_KEYS]);
    return;
  }

  if (resource_type === "model") {
    console.info("[ResourceChange] Invalidating model queries");
    invalidateQueryKeys(MODEL_QUERY_KEYS);
    return;
  }

  // Get the query keys associated with this resource type
  const queryKeys = RESOURCE_TYPE_TO_QUERY_KEYS[resource_type];

  if (!queryKeys || queryKeys.length === 0) {
    console.debug(
      `[ResourceChange] No query keys configured for resource_type: ${resource_type}, skipping cache invalidation`
    );
    return;
  }

  console.debug(
    `[ResourceChange] Invalidating ${queryKeys.length} query key(s) for ${resource_type}:`,
    queryKeys
  );

  // Invalidate all relevant query caches
  invalidateQueryKeys(queryKeys);

  // For specific resources, also invalidate their individual caches
  if (resource.id) {
    console.debug(
      `[ResourceChange] Invalidating individual resource queries for ${resource_type}:${resource.id}`
    );

    // For workflows, invalidate the specific workflow query
    if (resource_type === "workflow") {
      console.debug(
        `[ResourceChange] Invalidating workflow queries: ["workflow", "${resource.id}"], ["workflow", "${resource.id}", "versions"]`
      );
      queryClient.invalidateQueries({
        queryKey: ["workflow", resource.id]
      });
      queryClient.invalidateQueries({
        queryKey: ["workflow", resource.id, "versions"]
      });
    }

    // For threads, invalidate the specific thread query
    if (resource_type === "thread") {
      console.debug(
        `[ResourceChange] Invalidating thread queries: ["thread", "${resource.id}"], ["messages", "${resource.id}"]`
      );
      queryClient.invalidateQueries({
        queryKey: ["thread", resource.id]
      });
      queryClient.invalidateQueries({
        queryKey: ["messages", resource.id]
      });
    }

    // For jobs, invalidate the specific job query
    if (resource_type === "job") {
      console.debug(
        `[ResourceChange] Invalidating job query: ["job", "${resource.id}"]`
      );
      queryClient.invalidateQueries({
        queryKey: ["job", resource.id]
      });
    }
  }

  console.debug(
    `[ResourceChange] Cache invalidation complete for ${event} ${resource_type}:${resource.id}`
  );
}
