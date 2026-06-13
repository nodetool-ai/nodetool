import { createLogger } from "@nodetool-ai/config";
import { Workflow, Workspace } from "@nodetool-ai/models";
import { ProcessingContext, FileStorageAdapter } from "@nodetool-ai/runtime";

const log = createLogger("nodetool.websocket.workspace");

/**
 * Resolve the on-disk workspace directory for a workflow run.
 *
 * Workspace selection is stored on the workflow (`workflow.workspace_id`); this
 * maps it to the workspace's absolute `path`, gated on ownership and the folder
 * still being present and writable. Returns `null` when no workspace is assigned
 * or it isn't usable, in which case nodes fall back to a per-run temp dir.
 *
 * Every execution path that starts a run with a known workflow id must call this
 * so the workspace is applied consistently — not just the streaming WebSocket
 * runner.
 */
export async function resolveWorkflowWorkspace(
  workflowId: string,
  userId: string
): Promise<string | null> {
  try {
    const workflow = await Workflow.find(userId, workflowId);
    if (!workflow?.workspace_id) return null;
    const workspace = await Workspace.find(userId, workflow.workspace_id);
    if (!workspace || !workspace.isAccessible()) return null;
    return workspace.path;
  } catch (err) {
    log.warn("Failed to resolve workflow workspace", {
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
 */
export function buildWorkspaceExecutionContext(opts: {
  jobId: string;
  workflowId?: string | null;
  userId: string;
  workspaceDir: string | null;
}): ProcessingContext {
  return new ProcessingContext({
    jobId: opts.jobId,
    workflowId: opts.workflowId ?? null,
    userId: opts.userId,
    workspaceDir: opts.workspaceDir,
    workspaceStorage: opts.workspaceDir
      ? new FileStorageAdapter(opts.workspaceDir)
      : null
  });
}
