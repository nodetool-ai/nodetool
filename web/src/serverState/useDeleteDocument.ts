import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UseMutationResult } from "@tanstack/react-query";

import { trpcClient } from "../trpc/client";
import type { DocumentTreeLeaf } from "../hooks/useDocumentTreeData";
import { useDeleteEntity } from "./useEntities";
import { useWorkspaceTabsStore } from "../stores/WorkspaceTabsStore";

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
 * Deletes one project document through the router for its kind. An entity is a
 * marker on an asset, so removing it untags the asset and leaves the asset.
 */
const deleteDocument = async (
  document: DeletableDocument,
  deleteEntity: (assetId: string) => Promise<void>
): Promise<void> => {
  const { id } = document;
  switch (document.type) {
    case "workflow":
      await trpcClient.workflows.delete.mutate({ id });
      return;
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
  const closeTab = useWorkspaceTabsStore((state) => state.closeTab);
  return useMutation({
    mutationFn: (document) => deleteDocument(document, deleteEntity),
    onSuccess: (_result, document) => {
      closeTab(`${document.type}:${document.id}`);
      void queryClient.invalidateQueries({
        predicate: (query) => {
          const head = query.queryKey[0];
          return Array.isArray(head) && INVALIDATED_ROUTERS.has(head[0]);
        }
      });
    }
  });
}
