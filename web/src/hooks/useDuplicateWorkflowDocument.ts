import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useWorkflowManager } from "../contexts/WorkflowManagerContext";
import { fetchWorkflowById } from "../serverState/useWorkflow";
import { useWorkspaceTabsStore } from "../stores/WorkspaceTabsStore";
import type { WorkflowRequest } from "../stores/ApiTypes";
import { nextCopyName } from "../utils/nextCopyName";

/**
 * Copy a saved workflow into its own project as a new private workflow named
 * "Name (n)", and open the copy. `siblingNames` are the names already in the
 * list, so the number does not collide.
 */
export const useDuplicateWorkflowDocument = (): ((
  workflowId: string,
  siblingNames: readonly string[]
) => Promise<void>) => {
  const createWorkflow = useWorkflowManager((state) => state.create);
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const queryClient = useQueryClient();

  return useCallback(
    async (workflowId: string, siblingNames: readonly string[]) => {
      const source = await fetchWorkflowById(workflowId);
      const request: WorkflowRequest = {
        name: nextCopyName(source.name, siblingNames),
        description: source.description,
        tags: source.tags,
        thumbnail: source.thumbnail,
        thumbnail_url: source.thumbnail_url,
        access: "private",
        graph: structuredClone(source.graph),
        settings: source.settings
      };
      if (source.project_id) {
        request.project_id = source.project_id;
      }
      const copy = await createWorkflow(request);
      // The Documents panel and the project cards read the documents index.
      void queryClient.invalidateQueries({ queryKey: [["documents"]] });
      void queryClient.invalidateQueries({ queryKey: [["projects"]] });
      openTab({
        type: "workflow",
        ref: copy.id,
        mode: "edit",
        title: copy.name,
        projectId: copy.project_id ?? source.project_id ?? undefined
      });
    },
    [createWorkflow, openTab, queryClient]
  );
};
