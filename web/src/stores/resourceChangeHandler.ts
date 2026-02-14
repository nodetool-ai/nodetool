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
    `Resource change: ${event} ${resource_type}`,
    resource.id,
    resource.etag
  );

  // Get the query keys associated with this resource type
  const queryKeys = RESOURCE_TYPE_TO_QUERY_KEYS[resource_type];

  if (!queryKeys || queryKeys.length === 0) {
    log.debug(
      `No query keys configured for resource_type: ${resource_type}, skipping cache invalidation`
    );
    return;
  }

  // Invalidate all relevant query caches
  queryKeys.forEach((queryKey) => {
    log.debug(`Invalidating query cache: ${queryKey}`);
    queryClient.invalidateQueries({ queryKey: [queryKey] });
  });

  // For specific resources, also invalidate their individual caches
  if (resource.id) {
    // For workflows, invalidate the specific workflow query
    if (resource_type === "workflow") {
      queryClient.invalidateQueries({
        queryKey: ["workflow", resource.id]
      });
      queryClient.invalidateQueries({
        queryKey: ["workflow_versions", resource.id]
      });
    }

    // For threads, invalidate the specific thread query
    if (resource_type === "thread") {
      queryClient.invalidateQueries({
        queryKey: ["thread", resource.id]
      });
      queryClient.invalidateQueries({
        queryKey: ["messages", resource.id]
      });
    }

    // For jobs, invalidate the specific job query
    if (resource_type === "job") {
      queryClient.invalidateQueries({
        queryKey: ["job", resource.id]
      });
    }
  }
}
