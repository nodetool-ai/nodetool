/**
 * Workspace resolution for a run. The implementation moved to
 * `@nodetool-ai/execution/service` so every host — the server, the CLI, the
 * agent tools — resolves a workflow's workspace the same way. This module is
 * the server's import site for it, and the one place that tells the resolver
 * which object store backs a virtual workspace.
 */
import {
  setWorkspaceChangeNotifier,
  setWorkspaceCloudStorage,
  usesCloudWorkspaces,
  type WorkspaceFileChange
} from "@nodetool-ai/execution/service";
import { getAssetAdapter } from "./storage.js";
import { notifyResourceChange } from "../resource-events.js";

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

/**
 * How long writes are pooled before the browser is told, in ms.
 *
 * An agent that unpacks an archive writes hundreds of files in a burst, and
 * every one of them would otherwise be a websocket frame and a full re-listing.
 * The explorer only ever refetches, so one message per workspace per window
 * says everything a hundred would.
 */
const WORKSPACE_CHANGE_COALESCE_MS = 400;

const pendingWorkspaceChanges = new Map<
  string,
  { userId: string; timer: NodeJS.Timeout }
>();

/**
 * Push workspace file writes to the clients browsing that workspace.
 *
 * Workspace files are not database rows, so `ModelObserver` never sees them and
 * the Workspace Explorer had no way to learn that a chat turn had written one —
 * it showed whatever the panel happened to fetch when it mounted. This closes
 * that gap with the emitter the other non-DBModel resources already use.
 */
export function initWorkspaceChangeEvents(): void {
  setWorkspaceChangeNotifier((change: WorkspaceFileChange) => {
    const pending = pendingWorkspaceChanges.get(change.workspaceId);
    if (pending) return;
    const timer = setTimeout(() => {
      pendingWorkspaceChanges.delete(change.workspaceId);
      notifyResourceChange({
        event: "updated",
        resource_type: "workspacefile",
        resource: { id: change.workspaceId },
        userId: change.userId
      });
    }, WORKSPACE_CHANGE_COALESCE_MS);
    // A pending flush must not hold the process open at shutdown.
    timer.unref?.();
    pendingWorkspaceChanges.set(change.workspaceId, {
      userId: change.userId,
      timer
    });
  });
}
