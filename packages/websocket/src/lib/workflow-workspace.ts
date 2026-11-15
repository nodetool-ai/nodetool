/**
 * Workspace resolution for a run. The implementation lives in
 * `@nodetool-ai/execution/service` so every host — the server, the CLI, the
 * agent tools — resolves a run's project folder the same way. This module is
 * the server's import site for it, and the one place that tells the resolver
 * which object store backs a virtual workspace.
 */
import type { Asset } from "@nodetool-ai/models";
import {
  setWorkspaceChangeNotifier,
  setWorkspaceCloudStorage,
  usesCloudWorkspaces,
  type WorkspaceFileChange
} from "@nodetool-ai/execution/service";
import {
  onProjectFileChanged,
  scheduleWorkspaceReconcile
} from "@nodetool-ai/project-services/project-index";
import { getAssetAdapter } from "./storage.js";
import { discardVideoProxy, scheduleVideoProxy } from "./video-proxy.js";
import { notifyResourceChange } from "../resource-events.js";

export {
  resolveProjectWorkspace,
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

/**
 * Remake the proxy of a video whose file in the project folder has new
 * contents. A proxy records the size and mtime of the file it was made from
 * and is not played for another version, so the stale one is removed and a
 * new one queued. The thumbnail is replaced by the reconcile, and waveform
 * peaks are cached by the file's size and mtime, so neither needs a step
 * here.
 */
async function remakeVideoProxy(
  asset: Pick<Asset, "id" | "user_id" | "content_type">
): Promise<void> {
  if (!asset.content_type.startsWith("video/")) return;
  await discardVideoProxy(asset);
  scheduleVideoProxy(asset);
}

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
 *
 * A write into a project folder also reconciles that project's asset index,
 * debounced, so a media file an agent or a node wrote gets its asset row and
 * a file it moved keeps its asset. A file the reconcile finds changed gets
 * its video proxy remade.
 */
export function initWorkspaceChangeEvents(): void {
  onProjectFileChanged(remakeVideoProxy);
  setWorkspaceChangeNotifier((change: WorkspaceFileChange) => {
    scheduleWorkspaceReconcile(change.workspaceId, change.userId);
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
