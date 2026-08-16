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
import {
  handleDocumentResourceChange,
  type SyncedDocumentType
} from "./documentSync";

type WorkflowResourceReloader = (workflowId: string, etag?: string) => void;

let workflowResourceReloader: WorkflowResourceReloader | null = null;

export function setWorkflowResourceReloader(
  reloader: WorkflowResourceReloader | null
): void {
  workflowResourceReloader = reloader;
}

/**
 * Mapping of resource types to their TanStack Query cache keys.
 * When a resource change event is received, all associated query keys
 * will be invalidated to trigger refetch.
 *
 * `resource_type` matches the lowercased model class name emitted by the
 * backend ModelObserver (see packages/websocket/src/unified-websocket-runner.ts
 * `onModelChange`).
 *
 * Keys here are matched as prefixes by TanStack Query: `["assets"]` matches
 * `["assets", { parent_id: x }]`, `["assets", { workflow_id: y }]`, etc. — but
 * does NOT match the singular `["asset", id]`. Singular keys are invalidated
 * explicitly below for resources that use them.
 */
const RESOURCE_TYPE_TO_QUERY_KEYS: Record<string, string[]> = {
  workflow: ["workflows", "templates"],
  workflowversion: [],
  job: ["jobs"],
  asset: ["assets"],
  thread: ["threads"],
  message: ["messages"],
  collection: ["collections"],
  workspace: ["workspaces"],
  secret: ["secrets"],
  setting: ["settings"],
  metadata: ["metadata"]
};

/**
 * Document tables an open editor holds one row of. The list query behind the
 * surface's browser is refetched; the open document is handed to
 * `documentSync`, which knows whether the editor can safely take the server
 * copy. Blanket-invalidating the `get` query instead would refetch under a
 * live editor and clobber unsaved edits.
 */
const DOCUMENT_TRPC_ROUTER = {
  timelinesequence: "timeline",
  imagedocument: "sketch",
  storyboard: "storyboards",
  script: "scripts",
  jsscript: "jsScripts",
  application: "applications"
} satisfies Record<SyncedDocumentType, string>;

const isSyncedDocumentType = (value: string): value is SyncedDocumentType =>
  value in DOCUMENT_TRPC_ROUTER;

export const PROVIDER_QUERY_KEYS = ["providers"] as const;
export const MODEL_QUERY_KEYS = [
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

/** Invalidate one tRPC procedure's queries — key head is `[router, procedure]`. */
function invalidateTrpcProcedure(router: string, procedure: string): void {
  queryClient.invalidateQueries({
    predicate: (query) => {
      const head = query.queryKey[0];
      return Array.isArray(head) && head[0] === router && head[1] === procedure;
    }
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

  // WorkflowVersion: scope to the parent workflow when the runner forwards
  // workflow_id; otherwise refetch every cached versions list.
  if (resource_type === "workflowversion") {
    const workflowId =
      typeof resource.workflow_id === "string" ? resource.workflow_id : null;
    if (workflowId) {
      console.info(
        `[ResourceChange] Invalidating workflow versions for ${workflowId}`
      );
      queryClient.invalidateQueries({
        queryKey: ["workflow", workflowId, "versions"]
      });
    } else {
      console.info(
        "[ResourceChange] Invalidating all workflow version queries"
      );
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === "workflow" && query.queryKey[2] === "versions"
      });
    }
    return;
  }

  if (isSyncedDocumentType(resource_type)) {
    invalidateTrpcProcedure(DOCUMENT_TRPC_ROUTER[resource_type], "list");
    handleDocumentResourceChange(resource_type, {
      event,
      id: resource.id,
      updatedAt:
        typeof resource.updated_at === "string" ? resource.updated_at : null
    });
    return;
  }

  const queryKeys = RESOURCE_TYPE_TO_QUERY_KEYS[resource_type];

  if (queryKeys === undefined) {
    console.debug(
      `[ResourceChange] No query keys configured for resource_type: ${resource_type}, skipping cache invalidation`
    );
    return;
  }

  if (queryKeys.length > 0) {
    console.debug(
      `[ResourceChange] Invalidating ${queryKeys.length} query key(s) for ${resource_type}:`,
      queryKeys
    );
    invalidateQueryKeys(queryKeys);
  }

  // For specific resources, also invalidate their individual / scoped caches
  if (resource.id) {
    if (resource_type === "asset") {
      // The plural `["assets"]` key does not prefix-match the singular form,
      // so detail queries like `useAssetById` need an explicit invalidation.
      queryClient.invalidateQueries({
        queryKey: ["asset", resource.id]
      });
      queryClient.invalidateQueries({
        queryKey: ["textAsset", resource.id]
      });
    }

    if (resource_type === "workflow") {
      queryClient.invalidateQueries({
        queryKey: ["workflow", resource.id]
      });
      queryClient.invalidateQueries({
        queryKey: ["workflow", resource.id, "versions"]
      });
      if (event === "updated") {
        workflowResourceReloader?.(resource.id, resource.etag);
      }
    }

    if (resource_type === "thread") {
      queryClient.invalidateQueries({
        queryKey: ["thread", resource.id]
      });
      queryClient.invalidateQueries({
        queryKey: ["messages", resource.id]
      });
    }

    if (resource_type === "message") {
      // `resource.id` is the message id; messages are scoped by thread_id when
      // the runner provides it, but we can also fall back to invalidating any
      // thread-scoped messages query.
      const threadId =
        typeof resource.thread_id === "string" ? resource.thread_id : null;
      if (threadId) {
        queryClient.invalidateQueries({
          queryKey: ["messages", threadId]
        });
      }
    }

    if (resource_type === "job") {
      queryClient.invalidateQueries({
        queryKey: ["job", resource.id]
      });
    }
  }

  console.debug(
    `[ResourceChange] Cache invalidation complete for ${event} ${resource_type}:${resource.id}`
  );
}

/**
 * Invalidate every active query in the cache. Use after a long disconnect to
 * recover from any `resource_change` events the client missed while offline.
 */
export function invalidateAllResourceQueries(): void {
  console.info("[ResourceChange] Refreshing all resource queries");
  queryClient.invalidateQueries();
}
