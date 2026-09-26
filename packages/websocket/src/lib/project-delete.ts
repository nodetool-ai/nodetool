/**
 * The full project delete: database rows, stored asset bytes, workspace files,
 * and the live jobs and chat turns that still write into the project.
 *
 * The tRPC `projects.delete` procedure and the agent `delete_project`
 * capability both call this, so the two surfaces cannot delete different
 * amounts of a project.
 */

import {
  PERSONAL_PROJECT_KIND,
  Project,
  Asset,
  Job,
  Thread,
  Workspace
} from "@nodetool-ai/models";
import { assetKeyCandidates } from "@nodetool-ai/storage";
import { getAssetAdapter } from "./storage.js";
import { assetFileNameCandidates } from "./asset-paths.js";
import { thumbnailKey } from "./thumbnail.js";
import { videoProxyFileNames, videoProxyQueue } from "./video-proxy.js";
import { workspaceFromRow } from "./workflow-workspace.js";
import { jobRunRegistry } from "../job-run-registry.js";
import { chatTurnRegistry } from "../chat-turn-registry.js";

export type ProjectDeleteOutcome = "deleted" | "not_found" | "personal";

/** Stored asset bytes are project content too; database deletion alone leaks them. */
async function deleteProjectAssetObjects(
  assets: readonly Asset[]
): Promise<void> {
  const storage = getAssetAdapter();
  for (const asset of assets) {
    videoProxyQueue.cancel(asset.id);
  }
  await Promise.all(
    assets
      .filter((asset) => asset.content_type !== "folder")
      .flatMap((asset) =>
        [
          ...assetFileNameCandidates(asset.id, asset.content_type),
          thumbnailKey(asset.id),
          ...videoProxyFileNames(asset.id)
        ].flatMap((fileName) =>
          assetKeyCandidates(asset.user_id, fileName).map(async (key) => {
            const uri = storage.uriForKey(key);
            if (await storage.exists(uri)) await storage.delete(uri);
          })
        )
      )
  );
}

async function deleteProjectWorkspaceFiles(
  workspaces: readonly Workspace[]
): Promise<void> {
  await Promise.all(
    workspaces.map(async (row) => workspaceFromRow(row)?.deleteAll(""))
  );
}

export async function deleteProjectForUser(
  userId: string,
  projectId: string
): Promise<ProjectDeleteOutcome> {
  // A tombstoned project is still found here, so a failed delete can be retried.
  const target = await Project.findOwnedIncludingDeleted(userId, projectId);
  if (!target) return "not_found";
  if (target.kind === PERSONAL_PROJECT_KIND) return "personal";
  // The lookup accepts a short resource id. The listings and deletes below
  // match exactly, so they take the full id.
  const id = target.id;
  await Project.tombstoneOwned(userId, id);
  const [jobs, threads, assets, workspaces] = await Promise.all([
    Job.listByProject(userId, id),
    Thread.listByProject(userId, id),
    Asset.listByProject(userId, id),
    Workspace.listByProject(userId, id)
  ]);
  jobRunRegistry.cancelJobs(userId, new Set(jobs.map((job) => job.id)));
  chatTurnRegistry.abortThreads(
    userId,
    new Set(threads.map((thread) => thread.id))
  );
  // Keep the rows behind the tombstone until external cleanup succeeds.
  // A failed request can then be retried with every object identifier intact.
  await Promise.all([
    deleteProjectAssetObjects(assets),
    deleteProjectWorkspaceFiles(workspaces)
  ]);
  const deleted = await Project.deleteOwned(userId, id);
  return deleted ? "deleted" : "not_found";
}
