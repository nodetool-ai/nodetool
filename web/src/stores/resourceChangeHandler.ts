/**
 * Resource Change Handler
 *
 * Handles database resource change notifications (create/update/delete)
 * from the WebSocket and invalidates TanStack Query caches accordingly.
 *
 * This enables real-time synchronization of the client state with the backend
 * database without requiring manual cache invalidation or polling.
 */
import log from "loglevel";
import { queryClient } from "../queryClient";
import { ResourceChangeUpdate } from "./ApiTypes";

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
  model: ["models"],
  // Add more mappings as needed
};

/**
 * Handle resource change notifications from the WebSocket.
 *
 * @param update - The resource change update message
 */
export function handleResourceChange(update: ResourceChangeUpdate): void {
  const { event, resource_type, resource } = update;

  log.info(
    `[ResourceChange] Received update: ${event} ${resource_type}`,
    { id: resource.id, etag: resource.etag }
  );

  // Get the query keys associated with this resource type
  const queryKeys = RESOURCE_TYPE_TO_QUERY_KEYS[resource_type];

  if (!queryKeys || queryKeys.length === 0) {
    log.debug(
      `[ResourceChange] No query keys configured for resource_type: ${resource_type}, skipping cache invalidation`
    );
    return;
  }

  log.debug(
    `[ResourceChange] Invalidating ${queryKeys.length} query key(s) for ${resource_type}:`,
    queryKeys
  );

  // Invalidate all relevant query caches
  queryKeys.forEach((queryKey) => {
    log.debug(`[ResourceChange] Invalidating query cache: [${queryKey}]`);
    queryClient.invalidateQueries({ queryKey: [queryKey] });
  });

  // For specific resources, also invalidate their individual caches
  if (resource.id) {
    log.debug(
      `[ResourceChange] Invalidating individual resource queries for ${resource_type}:${resource.id}`
    );

    // For workflows, invalidate the specific workflow query
    if (resource_type === "workflow") {
      log.debug(`[ResourceChange] Invalidating workflow queries: ["workflow", "${resource.id}"], ["workflow", "${resource.id}", "versions"]`);
      queryClient.invalidateQueries({
        queryKey: ["workflow", resource.id]
      });
      queryClient.invalidateQueries({
        queryKey: ["workflow", resource.id, "versions"]
      });
    }

    // For threads, invalidate the specific thread query
    if (resource_type === "thread") {
      log.debug(`[ResourceChange] Invalidating thread queries: ["thread", "${resource.id}"], ["messages", "${resource.id}"]`);
      queryClient.invalidateQueries({
        queryKey: ["thread", resource.id]
      });
      queryClient.invalidateQueries({
        queryKey: ["messages", resource.id]
      });
    }

    // For jobs, invalidate the specific job query
    if (resource_type === "job") {
      log.debug(`[ResourceChange] Invalidating job query: ["job", "${resource.id}"]`);
      queryClient.invalidateQueries({
        queryKey: ["job", resource.id]
      });
    }
  }

  log.debug(
    `[ResourceChange] Cache invalidation complete for ${event} ${resource_type}:${resource.id}`
  );
}
