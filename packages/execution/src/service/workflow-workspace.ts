import { createLogger, workspaceStorageKind } from "@nodetool-ai/config";
import { Workflow, Workspace as WorkspaceRow, getSecret } from "@nodetool-ai/models";
import {
  ProcessingContext,
  createLocalWorkspace,
  createWorkspace,
  type StorageAdapter,
  type Workspace
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

/** Build the {@link Workspace} a workspace row describes. */
export function workspaceFromRow(row: WorkspaceRow): Workspace | null {
  if (!row.isVirtual()) return createLocalWorkspace(row.path);
  if (!cloudStorage) {
    log.warn(
      "A virtual workspace was requested but no cloud storage is configured",
      { workspaceId: row.id }
    );
    return null;
  }
  return createWorkspace(cloudStorage, { prefix: row.path });
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
}): ProcessingContext {
  return new ProcessingContext({
    jobId: opts.jobId,
    workflowId: opts.workflowId ?? null,
    userId: opts.userId,
    workspace: opts.workspace,
    secretResolver:
      opts.secretResolver ??
      ((key: string, userId: string) => getSecret(key, userId))
  });
}
