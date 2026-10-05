import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UseMutationResult } from "@tanstack/react-query";

import { useWorkflowManagerStore } from "../contexts/WorkflowManagerContext";
import { useDocumentDraftStore } from "../stores/DocumentDraftStore";
import { useWorkspaceTabsStore } from "../stores/WorkspaceTabsStore";
import type { WorkflowManagerStore } from "../stores/WorkflowManagerStore";
import { trpcClient } from "../trpc/client";
import type { DocumentTreeLeaf } from "../hooks/useDocumentTreeData";
import { useDeleteEntity } from "./useEntities";
import { fetchWorkflowById } from "./useWorkflow";

/** tRPC key heads: `[router, procedure]`. Lists of any kind may hold the row. */
const INVALIDATED_ROUTERS: ReadonlySet<unknown> = new Set([
  "documents",
  "projects",
  "workflows",
  "applications",
  "sketch",
  "scripts",
  "storyboards",
  "timeline",
  "jsScripts"
]);

type DeletableDocument = Pick<DocumentTreeLeaf, "id" | "type">;

/**
 * Deletes one project document through the router for its kind. A workflow goes
 * through the workflow manager, which also drops its favorite and tells the
 * desktop app to release its shortcut, so it needs the full row. An entity is a
 * marker on an asset, so removing it untags the asset and leaves the asset.
 */
const deleteDocument = async (
  document: DeletableDocument,
  deleteEntity: (assetId: string) => Promise<void>,
  manager: WorkflowManagerStore
): Promise<void> => {
  const { id } = document;
  switch (document.type) {
    case "workflow": {
      const workflow =
        manager.getState().getWorkflow(id) ?? (await fetchWorkflowById(id));
      await manager.getState().delete(workflow);
      return;
    }
    case "application":
      await trpcClient.applications.delete.mutate({ id });
      return;
    case "sketch":
      await trpcClient.sketch.delete.mutate({ id });
      return;
    case "script":
      await trpcClient.scripts.delete.mutate({ id });
      return;
    case "storyboard":
      await trpcClient.storyboards.delete.mutate({ id });
      return;
    case "timeline":
      await trpcClient.timeline.delete.mutate({ id });
      return;
    case "jsscript":
      await trpcClient.jsScripts.delete.mutate({ id });
      return;
    case "entity":
      await deleteEntity(id);
      return;
  }
};

export function useDeleteDocument(): UseMutationResult<
  void,
  Error,
  DeletableDocument
> {
  const queryClient = useQueryClient();
  const { mutateAsync: deleteEntity } = useDeleteEntity();
  const manager = useWorkflowManagerStore();
  const closeTab = useWorkspaceTabsStore((state) => state.closeTab);
  return useMutation({
    mutationFn: (document) => deleteDocument(document, deleteEntity, manager),
    onSuccess: (_result, document) => {
      const tabId = `${document.type}:${document.id}`;
      closeTab(tabId);
      useDocumentDraftStore.getState().discardDraft(tabId);
      if (document.type === "workflow") {
        manager.getState().removeWorkflow(document.id);
      }
      void queryClient.invalidateQueries({
        predicate: (query) => {
          const head = query.queryKey[0];
          return Array.isArray(head) && INVALIDATED_ROUTERS.has(head[0]);
        }
      });
    }
  });
}
