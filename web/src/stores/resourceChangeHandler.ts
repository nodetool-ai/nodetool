/**
 * Resource Change Handler
 *
 * Handles database resource change notifications (create/update/delete)
 * from the WebSocket and invalidates TanStack Query caches accordingly.
 *
 * This enables real-time synchronization of the client state with the backend
 * database without requiring manual cache invalidation or polling.
 */
import type {
  InvalidateQueryFilters,
  QueryKey
} from "@tanstack/react-query";
import { queryClient } from "../queryClient";
import type { DocumentOp } from "@nodetool-ai/protocol";
import { ResourceChangeUpdate } from "./ApiTypes";
import { loadMetadata } from "../serverState/useMetadata";
import {
  handleDocumentResourceChange,
  type SyncedDocumentType
} from "./documentSync";
import { isRecord, isString } from "../utils/typePredicates";
import { resolveDocumentProject } from "../lib/resolveDocumentProject";
import {
  LOOSE_PROJECT_ID,
  tabId,
  useWorkspaceTabsStore
} from "./WorkspaceTabsStore";
import { wasWorkflowCreatedHere } from "./workflowsCreatedHere";

/**
 * Returns true when an open editor owns the workflow. The reloader then
 * fetches the server copy and keeps the `["workflow", id]` query current, so
 * the handler does not invalidate it: that refetch would download the graph
 * an autosave just sent.
 */
type WorkflowResourceReloader = (
  workflowId: string,
  etag?: string,
  ops?: DocumentOp[]
) => boolean;

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
 * backend ModelObserver (see packages/websocket/src/websocket-client-session.ts
 * `onModelChange`).
 *
 * Keys here are matched as prefixes by TanStack Query: `["assets"]` matches
 * `["assets", { parent_id: x }]`, `["assets", { workflow_id: y }]`, etc. — but
 * does NOT match the singular `["asset", id]`. Singular keys are invalidated
 * explicitly below for resources that use them.
 */
const RESOURCE_TYPE_TO_QUERY_KEYS: Record<string, string[]> = {
  // Not "templates": they are shipped examples no user write changes, and
  // their loader re-reads every example file.
  workflow: ["workflows"],
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
  game: "games",
  application: "applications"
} satisfies Record<SyncedDocumentType, string>;

/**
 * List-shaped procedures beyond `list` a document change must refetch. The
 * node menu's custom nodes come from `jsScripts.palette`, so saving a script
 * has to reach it too.
 */
const DOCUMENT_EXTRA_PROCEDURES: Partial<Record<SyncedDocumentType, string[]>> =
  {
    jsscript: ["palette"],
    game: ["draftChanges", "revisions"]
  };

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

/** Trailing quiet window before queued invalidations run. */
export const INVALIDATION_DEBOUNCE_MS = 250;
/** Longest a queued invalidation waits while a burst keeps arriving. */
export const INVALIDATION_MAX_WAIT_MS = 1000;

/**
 * Invalidations queued since the last flush, keyed by a stable name for what
 * they match. A burst of K events (an asset per generated image, a prediction
 * per LLM call, every document autosave) used to invalidate the same queries
 * K times, and TanStack's default `cancelRefetch: true` aborted and restarted
 * the refetch each time after the server had already done the work.
 */
const pendingInvalidations = new Map<string, InvalidateQueryFilters>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let firstQueuedAt: number | null = null;

function queueInvalidation(key: string, filters: InvalidateQueryFilters): void {
  if (!pendingInvalidations.has(key)) {
    pendingInvalidations.set(key, filters);
  }
  const now = Date.now();
  if (firstQueuedAt === null) {
    firstQueuedAt = now;
  }
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
  }
  const untilMaxWait = firstQueuedAt + INVALIDATION_MAX_WAIT_MS - now;
  flushTimer = setTimeout(
    flushResourceInvalidations,
    Math.max(0, Math.min(INVALIDATION_DEBOUNCE_MS, untilMaxWait))
  );
}

/**
 * Run every queued invalidation once. `cancelRefetch: false` joins a refetch
 * already in flight instead of aborting it. Exported so tests can flush
 * without waiting out the window.
 */
export function flushResourceInvalidations(): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  firstQueuedAt = null;
  const batch = [...pendingInvalidations.values()];
  pendingInvalidations.clear();
  for (const filters of batch) {
    void queryClient.invalidateQueries(filters, { cancelRefetch: false });
  }
}

function invalidateQueryKey(queryKey: QueryKey): void {
  queueInvalidation(`key:${JSON.stringify(queryKey)}`, { queryKey });
}

function invalidateQueryKeys(keys: readonly string[]): void {
  keys.forEach((queryKey) => {
    console.debug(`[ResourceChange] Invalidating query cache: [${queryKey}]`);
    invalidateQueryKey([queryKey]);
  });
}

/**
 * `projects.*` procedures whose input names one project as `input.id`. The
 * rest (`list`, `archived`, `summaries`, `unassigned`) span every project.
 */
const PER_PROJECT_PROCEDURES: ReadonlySet<unknown> = new Set<unknown>([
  "get",
  "documentPage",
  "documents",
  "thread"
]);

/** The `input.id` of a tRPC query key `[[router, procedure], { input }]`. */
function trpcInputId(queryKey: QueryKey): unknown {
  const options = queryKey[1];
  if (!isRecord(options) || !isRecord(options.input)) {
    return undefined;
  }
  return options.input.id;
}

/**
 * Everything the projects router answers. A project owns no content of its
 * own — its overview and its cards are derived from the document rows — so any
 * document write can change what they show. A change that names its project
 * refetches that project's views and the cross-project ones; without one,
 * every project's views are refetched.
 */
function invalidateProjectViews(projectId: string | null): void {
  if (projectId === null) {
    queueInvalidation("projects:*", {
      predicate: (query) => {
        const head = query.queryKey[0];
        return Array.isArray(head) && head[0] === "projects";
      }
    });
    return;
  }
  queueInvalidation("projects:global", {
    predicate: (query) => {
      const head = query.queryKey[0];
      return (
        Array.isArray(head) &&
        head[0] === "projects" &&
        !PER_PROJECT_PROCEDURES.has(head[1])
      );
    }
  });
  queueInvalidation(`projects:${projectId}`, {
    predicate: (query) => {
      const head = query.queryKey[0];
      return (
        Array.isArray(head) &&
        head[0] === "projects" &&
        PER_PROJECT_PROCEDURES.has(head[1]) &&
        trpcInputId(query.queryKey) === projectId
      );
    }
  });
}

/**
 * The project navigator's index. It lists every kind of document in one query,
 * so any write that adds, renames, moves or removes one changes what it shows —
 * and no per-kind `list` invalidation reaches it.
 */
function invalidateDocumentIndex(): void {
  invalidateTrpcProcedure("documents", "index");
}

/** Invalidate one tRPC procedure's queries — key head is `[router, procedure]`. */
function invalidateTrpcProcedure(router: string, procedure: string): void {
  queueInvalidation(`trpc:${router}.${procedure}`, {
    predicate: (query) => {
      const head = query.queryKey[0];
      return Array.isArray(head) && head[0] === router && head[1] === procedure;
    }
  });
}

/**
 * A workflow created outside the editor (bundle import, API, agent) has no tab
 * and no editor store until something opens it. Opening the tab mounts the
 * editor, which is what makes the workflow editable. A workflow this page
 * created already has its surface: the guided Workflow flow keeps its draft in
 * a guided flow tab, and a second editor tab beside it was a stray "Untitled".
 */
async function openCreatedWorkflowTab(id: string): Promise<void> {
  const hasSurface = (): boolean =>
    wasWorkflowCreatedHere(id) ||
    useWorkspaceTabsStore
      .getState()
      .tabs.some((tab) => tab.id === tabId("workflow", id));
  if (hasSurface()) {
    return;
  }
  try {
    const document = await resolveDocumentProject("workflow", id);
    // The event can arrive before this page's own create call returns.
    if (hasSurface()) {
      return;
    }
    useWorkspaceTabsStore.getState().openTab({
      type: "workflow",
      ref: document.id,
      mode: "edit",
      projectId: document.projectId ?? LOOSE_PROJECT_ID
    });
  } catch (error) {
    console.warn(`[ResourceChange] Could not open workflow ${id}`, error);
  }
}

/**
 * Handle resource change notifications from the WebSocket. Query
 * invalidations are queued and flushed together (see `queueInvalidation`).
 * Editor syncs, the workflow reloader, tab opening and metadata reloads run
 * immediately.
 *
 * @param update - The resource change update message
 */
export function handleResourceChange(update: ResourceChangeUpdate): void {
  const { event, resource_type, resource } = update;
  const projectId = isString(resource.project_id) ? resource.project_id : null;

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

  // Workspace *files* are not rows, so this arrives from the server's own
  // emitter rather than ModelObserver. `resource.id` is the workspace the write
  // landed in; without one, refetch every cached listing.
  if (resource_type === "workspacefile") {
    const workspaceId = isString(resource.id) ? resource.id : null;
    console.info(
      `[ResourceChange] Invalidating workspace files for ${workspaceId ?? "all workspaces"}`
    );
    invalidateQueryKey(
      workspaceId ? ["workspace-files", workspaceId] : ["workspace-files"]
    );
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
      isString(resource.workflow_id) ? resource.workflow_id : null;
    if (workflowId) {
      console.info(
        `[ResourceChange] Invalidating workflow versions for ${workflowId}`
      );
      invalidateQueryKey(["workflow", workflowId, "versions"]);
    } else {
      console.info(
        "[ResourceChange] Invalidating all workflow version queries"
      );
      queueInvalidation("workflow-versions:*", {
        predicate: (query) =>
          query.queryKey[0] === "workflow" && query.queryKey[2] === "versions"
      });
    }
    return;
  }

  if (resource_type === "project") {
    invalidateProjectViews(projectId);
    invalidateDocumentIndex();
    return;
  }

  // Chat-only spend (LLM/pipeline calls) lands as `prediction` rows with no
  // document row of its own, so it reaches no other branch here — but it
  // changes what a project's overview and cards show for cost.
  if (resource_type === "prediction") {
    invalidateProjectViews(projectId);
    return;
  }

  if (isSyncedDocumentType(resource_type)) {
    const trpcRouter = DOCUMENT_TRPC_ROUTER[resource_type];
    invalidateTrpcProcedure(trpcRouter, "list");
    invalidateProjectViews(projectId);
    invalidateDocumentIndex();
    for (const procedure of DOCUMENT_EXTRA_PROCEDURES[resource_type] ?? []) {
      invalidateTrpcProcedure(trpcRouter, procedure);
    }
    handleDocumentResourceChange(resource_type, {
      event,
      id: resource.id,
      updatedAt:
        isString(resource.updated_at) ? resource.updated_at : null,
      ops: update.ops
    });
    return;
  }

  // An entity is an image asset carrying the entity marker, so an entity the
  // agent writes arrives here as an asset change and nothing else. The library
  // query is keyed `["entities"]`, which `["assets"]` does not prefix-match,
  // and a project's overview lists the entities filed under it — neither
  // refetches unless this says so. The frame carries no marker, so both are
  // invalidated for any asset write rather than guessed at.
  if (resource_type === "asset") {
    invalidateQueryKey(["entities"]);
    invalidateProjectViews(projectId);
    invalidateDocumentIndex();
  }

  if (resource_type === "workflow") {
    // The Home documents strip reads projects.documentPage. Without this a
    // saved workflow was missing from it until a reload.
    invalidateProjectViews(projectId);
    invalidateDocumentIndex();
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
      invalidateQueryKey(["asset", resource.id]);
      invalidateQueryKey(["textAsset", resource.id]);
      invalidateQueryKey(["spreadsheetAsset", resource.id]);
    }

    if (resource_type === "workflow") {
      if (event === "created") {
        void openCreatedWorkflowTab(resource.id);
      }
      let editorOwnsWorkflow = false;
      if (event === "updated") {
        // Merge against the cached base BEFORE invalidation. An observer
        // refetch that lands first would make base == server and drop the
        // external change silently.
        editorOwnsWorkflow =
          workflowResourceReloader?.(
            resource.id,
            isString(resource.etag) ? resource.etag : undefined,
            update.ops
          ) ?? false;
      }
      if (!editorOwnsWorkflow) {
        invalidateQueryKey(["workflow", resource.id]);
      }
      invalidateQueryKey(["workflow", resource.id, "versions"]);
    }

    if (resource_type === "thread") {
      invalidateQueryKey(["thread", resource.id]);
      invalidateQueryKey(["messages", resource.id]);
    }

    if (resource_type === "message") {
      // `resource.id` is the message id; messages are scoped by thread_id when
      // the runner provides it, but we can also fall back to invalidating any
      // thread-scoped messages query.
      const threadId =
        isString(resource.thread_id) ? resource.thread_id : null;
      if (threadId) {
        invalidateQueryKey(["messages", threadId]);
      }
    }

    if (resource_type === "job") {
      invalidateQueryKey(["job", resource.id]);
    }
  }

  console.debug(
    `[ResourceChange] Cache invalidation complete for ${event} ${resource_type}:${resource.id}`
  );
}

/**
 * Invalidate every active query in the cache. Use after a long disconnect to
 * recover from any `resource_change` events the client missed while offline.
 * It covers everything queued, so the queue is dropped.
 */
export function invalidateAllResourceQueries(): void {
  console.info("[ResourceChange] Refreshing all resource queries");
  pendingInvalidations.clear();
  flushResourceInvalidations();
  void queryClient.invalidateQueries({}, { cancelRefetch: false });
}
