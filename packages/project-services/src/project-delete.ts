/**
<<<<<<<< Updated upstream:packages/project-services/src/project-delete.ts
 * The full project delete: database rows, stored asset bytes, workspace files,
 * and the live jobs and chat turns that still write into the project.
 *
 * The tRPC `projects.delete` procedure and the agent `delete_project`
 * capability both call this, so the two surfaces cannot delete different
 * amounts of a project. A host that runs jobs, chat turns or video proxies
 * passes `cancelLiveWork` to stop them before their files go.
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
import { getAssetAdapter } from "@nodetool-ai/asset-services/storage";
import {
  assetFileNameCandidates,
  videoProxyFileNames
} from "@nodetool-ai/asset-services/asset-paths";
import { thumbnailKey } from "@nodetool-ai/asset-services/thumbnail";
import { workspaceFromRow } from "@nodetool-ai/execution/service";
========
 * The server's project delete: the shared delete plus this process's live
 * jobs, chat turns and queued video proxies.
 */
import {
  deleteProjectForUser as deleteProject,
  type ProjectDeleteOutcome
} from "@nodetool-ai/project-services/project-delete";
import { videoProxyQueue } from "./video-proxy.js";
import { jobRunRegistry } from "../job-run-registry.js";
import { chatTurnRegistry } from "../chat-turn-registry.js";
>>>>>>>> Stashed changes:packages/websocket/src/lib/project-delete.ts

export type { ProjectDeleteOutcome };

<<<<<<<< Updated upstream:packages/project-services/src/project-delete.ts
/** The live work in a project that is being deleted. */
export interface ProjectLiveWork {
  userId: string;
  jobIds: ReadonlySet<string>;
  threadIds: ReadonlySet<string>;
  assetIds: readonly string[];
}

export interface ProjectDeleteOptions {
  /** Stop the host's running jobs, chat turns and queued asset work. */
  cancelLiveWork?: (work: ProjectLiveWork) => void;
}

/** Stored asset bytes are project content too; database deletion alone leaks them. */
async function deleteProjectAssetObjects(
  assets: readonly Asset[]
): Promise<void> {
  const storage = getAssetAdapter();
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
========
export function deleteProjectForUser(
>>>>>>>> Stashed changes:packages/websocket/src/lib/project-delete.ts
  userId: string,
  projectId: string,
  options: ProjectDeleteOptions = {}
): Promise<ProjectDeleteOutcome> {
<<<<<<<< Updated upstream:packages/project-services/src/project-delete.ts
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
  options.cancelLiveWork?.({
    userId,
    jobIds: new Set(jobs.map((job) => job.id)),
    threadIds: new Set(threads.map((thread) => thread.id)),
    assetIds: assets.map((asset) => asset.id)
  });
  // Keep the rows behind the tombstone until external cleanup succeeds.
  // A failed request can then be retried with every object identifier intact.
  await Promise.all([
    deleteProjectAssetObjects(assets),
    deleteProjectWorkspaceFiles(workspaces)
  ]);
  const deleted = await Project.deleteOwned(userId, id);
  return deleted ? "deleted" : "not_found";
========
  return deleteProject(userId, projectId, {
    cancelLiveWork: ({ jobIds, threadIds, assetIds }) => {
      for (const assetId of assetIds) videoProxyQueue.cancel(assetId);
      jobRunRegistry.cancelJobs(userId, jobIds);
      chatTurnRegistry.abortThreads(userId, threadIds);
    }
  });
>>>>>>>> Stashed changes:packages/websocket/src/lib/project-delete.ts
}
