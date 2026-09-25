import { trpcClient } from "../trpc/client";
import type { WorkspaceTabType } from "../stores/WorkspaceTabsStore";

export type DocumentTabType = Extract<
  WorkspaceTabType,
  "workflow" | "timeline" | "storyboard" | "script" | "jsscript" | "sketch" | "application" | "model3d"
>;

interface DocumentLocation {
  id: string;
  projectId?: string;
}

export const resolveDocumentProject = async (
  type: DocumentTabType,
  id: string
): Promise<DocumentLocation> => {
  switch (type) {
    case "workflow": {
      const document = await trpcClient.workflows.get.query({ id });
      return { id: document.id, projectId: document.project_id };
    }
    case "timeline": {
      const document = await trpcClient.timeline.get.query({ id });
      return { id: document.id, projectId: document.projectId };
    }
    case "storyboard": {
      const document = await trpcClient.storyboards.get.query({ id });
      return { id: document.id, projectId: document.projectId };
    }
    case "script": {
      const document = await trpcClient.scripts.get.query({ id });
      return { id: document.id, projectId: document.projectId };
    }
    case "jsscript": {
      const document = await trpcClient.jsScripts.get.query({ id });
      return { id: document.id, projectId: document.projectId };
    }
    case "sketch": {
      const document = await trpcClient.sketch.get.query({ id });
      return { id: document.id, projectId: document.projectId };
    }
    case "application": {
      const document = await trpcClient.applications.get.query({ id });
      return { id: document.id, projectId: document.projectId };
    }
    case "model3d": {
      const document = await trpcClient.assets.get.query({ id });
      return { id: document.id, projectId: document.project_id };
    }
  }
};
