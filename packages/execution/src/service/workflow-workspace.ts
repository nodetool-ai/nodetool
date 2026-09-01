import { createLogger, workspaceStorageKind } from "@nodetool-ai/config";
import { Workflow, Workspace as WorkspaceRow, getSecret } from "@nodetool-ai/models";
import {
  ProcessingContext,
  createLocalWorkspace,
  createWorkspace,
  observeWorkspace,
  type StorageAdapter,
  type Workspace,
  type WorkspaceChange
} from "@nodetool-ai/runtime";

const log = createLogger("nodetool.execution.workspace");

/**
 * The object store a cloud deployment keeps workspaces in.
 *
 * Injected by the host rather than constructed here: `@nodetool-ai/execution`
 * has no storage dependency, and the server already builds exactly one asset
 * adapter it wants reused (connection pools, credentials).
 */
let cloudStorage: StorageAdapter | null = null;

/** Called once at startup by a host that serves cloud workspaces. */
export function setWorkspaceCloudStorage(storage: StorageAdapter | null): void {
  cloudStorage = storage;
}

/** What a host is told when a run writes in a workspace. */
export interface WorkspaceFileChange extends WorkspaceChange {
  workspaceId: string;
  userId: string;
}

/**
 * Told about every file a run writes, so a host can push the change to a
 * client watching that workspace.
 *
 * Injected the way {@link setWorkspaceCloudStorage} is: `@nodetool-ai/execution`
 * has no websocket to broadcast on, and the workspace row id — which the
 * {@link Workspace} interface deliberately does not carry — is known only here,
 * where the row is read.
 */
let changeNotifier: ((change: WorkspaceFileChange) => void) | null = null;

/** Called once at startup by a host that pushes workspace changes to clients. */
export function setWorkspaceChangeNotifier(
  notify: ((change: WorkspaceFileChange) => void) | null
): void {
  changeNotifier = notify;
}

/** Build the {@link Workspace} a workspace row describes. */
export function workspaceFromRow(row: WorkspaceRow): Workspace | null {
  const workspace = !row.isVirtual()
    ? createLocalWorkspace(row.path)
    : cloudStorage
      ? createWorkspace(cloudStorage, { prefix: row.path })
      : null;
  if (!workspace) {
    log.warn(
      "A virtual workspace was requested but no cloud storage is configured",
      { workspaceId: row.id }
    );
    return null;
  }
  const notify = changeNotifier;
  if (!notify) return workspace;
  return observeWorkspace(workspace, (change) =>
    notify({ ...change, workspaceId: row.id, userId: row.user_id })
  );
}

/**
 * Resolve the workspace a run reads and writes in.
 *
 * Selection is stored on the workflow (`workflow.workspace_id`); this maps it
 * to a {@link Workspace}, gated on ownership and the workspace still being
 * usable. When the workflow names none — or there is no workflow at all, which
 * is every chat turn — the run falls back to the user's default workspace,
 * created on first use.
 *
 * What comes back is an interface, not a directory: a local install gets one
 * over a real folder and a cloud deployment one over its object storage, and
 * nothing downstream can tell which. It answers null only when the database or
 * the storage refused, and a caller that gets null must report that rather than
 * writing somewhere else.
 */
export async function resolveWorkflowWorkspace(
  workflowId: string | null,
  userId: string
): Promise<Workspace | null> {
  try {
    if (workflowId) {
      const workflow = await Workflow.find(userId, workflowId);
      if (workflow?.workspace_id) {
        const row = await WorkspaceRow.find(userId, workflow.workspace_id);
        if (row?.isAccessible()) {
          const workspace = workspaceFromRow(row);
          if (workspace) return workspace;
        }
      }
    }
    const fallback = await WorkspaceRow.ensureDefault(userId);
    return fallback.isAccessible() ? workspaceFromRow(fallback) : null;
  } catch (err) {
    log.warn("Failed to resolve run workspace", {
      workflowId,
      userId,
      error: err instanceof Error ? err.message : String(err)
    });
    return null;
  }
}

/**
 * The directory a run's workspace lives in, or null when it is virtual.
 *
 * Only for the few callers that still need a real path (host binaries). Prefer
 * {@link resolveWorkflowWorkspace} and the {@link Workspace} interface, which
 * work on both deployments.
 */
export async function resolveWorkflowWorkspaceDir(
  workflowId: string | null,
  userId: string
): Promise<string | null> {
  return (await resolveWorkflowWorkspace(workflowId, userId))?.localDir ?? null;
}

/** True when this deployment keeps workspaces in object storage. */
export function usesCloudWorkspaces(): boolean {
  return workspaceStorageKind() === "cloud";
}

/**
 * Build a minimal execution context carrying the resolved workspace, for run
 * paths (REST / tRPC / MCP) that otherwise run without a ProcessingContext.
 * The streaming WebSocket runner builds a richer context of its own; this keeps
 * the workspace available everywhere else with the same resolution rules.
 *
 * The run's secrets come with it. Without a resolver `context.getSecret`
 * answers `null` for every key and providers see only the process environment,
 * so a key stored in the secret DB is invisible: an agent could generate an
 * image in a chat turn and get a 401 from the same provider when it ran the
 * workflow it had just built. The resolver is scoped to the run's own user,
 * which is the only account whose secrets this run may read.
 *
 * So do the storage adapters. A context with none resolves no `asset://` ref
 * at all — every uploaded image wired into a graph reached its node empty, and
 * the node reported "The input image is empty". The host passes the same two
 * adapters the streaming WebSocket runner uses; a host that passes neither
 * keeps the old read-nothing behaviour rather than guessing at a backend.
 *
 * No permission gate goes on this context, and that is the decision, not an
 * omission: a workflow run is consent — the user pressed Run on a graph whose
 * nodes list their tools — so an agent loop inside it gates in `auto` with no
 * human to ask. That is exactly what `gateFromContext` in
 * `@nodetool-ai/agents` answers for a context carrying no host gate, and
 * building the same object here would invert the package edge (`agents`
 * depends on `execution`, not the reverse) to say what its absence already
 * says. A host that does have a user to ask — a chat turn — puts its own gate
 * on the context it hands in.
 */
export function buildWorkspaceExecutionContext(opts: {
  jobId: string;
  workflowId?: string | null;
  userId: string;
  workspace: Workspace | null;
  /** Overrides the per-user DB lookup (tests, a host with its own store). */
  secretResolver?: (
    key: string,
    userId: string
  ) => Promise<string | null | undefined> | string | null | undefined;
  /** Temp store for runtime-materialized refs. */
  storage?: StorageAdapter | null;
  /** Asset store `asset://<id>` references resolve through. */
  assetStorage?: StorageAdapter | null;
}): ProcessingContext {
  return new ProcessingContext({
    jobId: opts.jobId,
    workflowId: opts.workflowId ?? null,
    userId: opts.userId,
    workspace: opts.workspace,
    storage: opts.storage ?? null,
    assetStorage: opts.assetStorage ?? null,
    secretResolver:
      opts.secretResolver ??
      ((key: string, userId: string) => getSecret(key, userId))
  });
}
