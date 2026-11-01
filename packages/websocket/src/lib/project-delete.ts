/**
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

export type { ProjectDeleteOutcome };

export function deleteProjectForUser(
  userId: string,
  projectId: string
): Promise<ProjectDeleteOutcome> {
  return deleteProject(userId, projectId, {
    cancelLiveWork: ({ jobIds, threadIds, assetIds }) => {
      for (const assetId of assetIds) videoProxyQueue.cancel(assetId);
      jobRunRegistry.cancelJobs(userId, jobIds);
      chatTurnRegistry.abortThreads(userId, threadIds);
    }
  });
}
