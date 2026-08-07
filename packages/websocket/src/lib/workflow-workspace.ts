/**
 * Workspace resolution for a run. The implementation moved to
 * `@nodetool-ai/execution/service` so every host — the server, the CLI, the
 * agent tools — resolves a workflow's workspace the same way. This module is
 * the server's import site for it.
 */
export {
  resolveWorkflowWorkspace,
  buildWorkspaceExecutionContext
} from "@nodetool-ai/execution/service";
