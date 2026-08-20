/**
 * Workspace resolution for a run. The implementation moved to
 * `@nodetool-ai/execution/service` so every host — the server, the CLI, the
 * agent tools — resolves a workflow's workspace the same way. This module is
 * the server's import site for it, and the one place that tells the resolver
 * which object store backs a virtual workspace.
 */
import {
  setWorkspaceCloudStorage,
  usesCloudWorkspaces
} from "@nodetool-ai/execution/service";
import { getAssetAdapter } from "./storage.js";

export {
  resolveWorkflowWorkspace,
  workspaceFromRow,
  usesCloudWorkspaces,
  buildWorkspaceExecutionContext
} from "@nodetool-ai/execution/service";

/**
 * Point virtual workspaces at the deployment's asset storage.
 *
 * Called once at startup. The adapter is the same one assets use — one bucket,
 * one set of credentials — with each user's workspace carved out under its own
 * key prefix. On a local install this is a no-op: workspaces are folders and
 * the resolver never asks for cloud storage.
 */
export function initWorkspaceStorage(): void {
  if (!usesCloudWorkspaces()) return;
  setWorkspaceCloudStorage(getAssetAdapter());
}
