import { createLogger } from "@nodetool-ai/config";
import { Workflow, Workspace, getSecret } from "@nodetool-ai/models";
import { ProcessingContext, FileStorageAdapter } from "@nodetool-ai/runtime";

const log = createLogger("nodetool.execution.workspace");

/**
 * Resolve the on-disk workspace directory for a run.
 *
 * Workspace selection is stored on the workflow (`workflow.workspace_id`); this
 * maps it to the workspace's absolute `path`, gated on ownership and the folder
 * still being present and writable. When the workflow names no workspace — or
 * there is no workflow at all, which is every chat turn — the run falls back to
 * the user's default workspace, creating the managed folder on first use.
 *
 * It therefore answers with a directory in all but one case: the database or
 * the filesystem refused, and the caller runs without a workspace root. Nothing
 * routine reaches that branch, so a run no longer scatters its files across the
 * OS temp dir where the user cannot find them.
 *
 * Every execution path that starts a run must call this so the workspace is
 * applied consistently — not just the streaming WebSocket runner.
 */
export async function resolveWorkflowWorkspace(
  workflowId: string | null,
  userId: string
): Promise<string | null> {
  try {
    if (workflowId) {
      const workflow = await Workflow.find(userId, workflowId);
      if (workflow?.workspace_id) {
        const workspace = await Workspace.find(userId, workflow.workspace_id);
        if (workspace?.isAccessible()) return workspace.path;
      }
    }
    const fallback = await Workspace.ensureDefault(userId);
    return fallback.isAccessible() ? fallback.path : null;
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
  workspaceDir: string | null;
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
    workspaceDir: opts.workspaceDir,
    workspaceStorage: opts.workspaceDir
      ? new FileStorageAdapter(opts.workspaceDir)
      : null,
    secretResolver:
      opts.secretResolver ??
      ((key: string, userId: string) => getSecret(key, userId))
  });
}
