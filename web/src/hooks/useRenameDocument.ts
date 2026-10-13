import { useCallback } from "react";

import { useWorkflowManagerStore } from "../contexts/WorkflowManagerContext";
import { useAssetStore } from "../stores/AssetStore";
import useGlobalChatStore from "../stores/GlobalChatStore";
import { useJsScriptStore } from "../stores/jsScript/JsScriptStore";
import { useNotificationStore } from "../stores/NotificationStore";
import { getActiveSketchInstance } from "../stores/sketch/SketchInstance";
import { renameSketchDocument } from "../stores/sketch/SketchSessionStore";
import {
  useWorkspaceTabsStore,
  type WorkspaceTabType
} from "../stores/WorkspaceTabsStore";
import { trpc, trpcClient } from "../trpc/client";
import { readSketchDocumentId } from "./sketch/ensureSketchDocumentForAsset";
import { useUpdateApplication } from "./useApplications";
import { renameStrategy } from "../components/workspace/tabRename";
import { renameTitledDocument } from "../components/workspace/renameTitledDocument";

/** The document to rename and the name it shows now. */
export interface RenameDocumentTarget {
  readonly type: WorkspaceTabType;
  readonly ref: string;
  readonly currentName: string;
}

export type RenameDocument = (
  target: RenameDocumentTarget,
  newName: string
) => Promise<void>;

/** Rename the sketch in the active editor through its session, else on the server. */
const renameSketch = async (id: string, name: string): Promise<void> => {
  const instance = getActiveSketchInstance();
  if (instance.session.getState().documentId === id) {
    await renameSketchDocument(instance, name);
    return;
  }
  await trpcClient.sketch.update.mutate({ id, name });
};

/**
 * Renames a document by type and id, whether or not a tab shows it. An open
 * tab's title changes at once and rolls back if the server refuses. The
 * project overview cards and the Documents panel refetch their names.
 */
export const useRenameDocument = (): RenameDocument => {
  const workflowManagerStore = useWorkflowManagerStore();
  const setTitle = useWorkspaceTabsStore((state) => state.setTitle);
  const updateApplication = useUpdateApplication();
  const trpcUtils = trpc.useUtils();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  return useCallback<RenameDocument>(
    async ({ type, ref, currentName }, newName) => {
      const trimmed = newName.trim();
      if (trimmed.length === 0 || trimmed === currentName) {
        return;
      }
      const strategy = renameStrategy(type);
      if (strategy === null) {
        return;
      }

      const refreshDocumentLists = () => {
        void trpcUtils.documents.index.invalidate();
        void trpcUtils.projects.documentPage.invalidate();
        void trpcUtils.projects.summaries.invalidate();
      };

      // An open workflow carries its name in the workflow store, and
      // WorkspaceShell syncs the tab title from there.
      if (strategy === "workflow") {
        const manager = workflowManagerStore.getState();
        const workflow = manager.getWorkflow(ref);
        if (workflow) {
          if (workflow.name === trimmed) {
            return;
          }
          const updatedWorkflow = { ...workflow, name: trimmed };
          manager.updateWorkflow(updatedWorkflow);
          try {
            await manager.saveWorkflow(updatedWorkflow);
            refreshDocumentLists();
          } catch (error) {
            manager.updateWorkflow(workflow);
            addNotification({
              type: "error",
              alert: true,
              content: `Failed to rename workflow: ${error instanceof Error ? error.message : "Unknown error"}`
            });
          }
          return;
        }
        try {
          await trpcClient.workflows.update.mutate({ id: ref, name: trimmed });
          void manager.queryClient.invalidateQueries({
            queryKey: ["workflow", ref]
          });
          void manager.queryClient.invalidateQueries({
            queryKey: ["workflows"]
          });
          refreshDocumentLists();
        } catch (error) {
          addNotification({
            type: "error",
            alert: true,
            content: `Failed to rename workflow: ${error instanceof Error ? error.message : "Unknown error"}`
          });
        }
        return;
      }

      // Other document types own no store→tab sync: update an open tab's
      // title optimistically, persist the rename, and roll the title back if
      // the server write fails.
      setTitle(ref, type, trimmed);
      try {
        switch (strategy) {
          case "sketch":
            await renameSketch(ref, trimmed);
            break;
          case "image": {
            const asset = await useAssetStore.getState().update({
              id: ref,
              name: trimmed
            });
            const sketchId = readSketchDocumentId(asset);
            if (sketchId) {
              await renameSketch(sketchId, trimmed);
            }
            break;
          }
          case "timeline":
            await trpcClient.timeline.update.mutate({ id: ref, name: trimmed });
            break;
          case "asset":
            await useAssetStore.getState().update({ id: ref, name: trimmed });
            break;
          case "storyboard":
            await renameTitledDocument(strategy, ref, trimmed);
            void trpcUtils.storyboards.list.invalidate();
            break;
          case "script":
            await renameTitledDocument(strategy, ref, trimmed);
            void trpcUtils.scripts.list.invalidate();
            break;
          case "jsscript": {
            const store = useJsScriptStore.getState();
            if (store.scripts[ref]) {
              store.setName(ref, trimmed);
            } else {
              await trpcClient.jsScripts.update.mutate({
                id: ref,
                name: trimmed
              });
            }
            break;
          }
          case "skill": {
            const currentSkill =
              trpcUtils.skills.get.getData({ id: ref }) ??
              (await trpcUtils.skills.get.fetch({ id: ref }));
            const updated = await trpcClient.skills.update.mutate({
              id: ref,
              name: trimmed,
              baseUpdatedAt: currentSkill.updatedAt
            });
            trpcUtils.skills.get.setData({ id: ref }, updated);
            void trpcUtils.skills.list.invalidate();
            break;
          }
          case "chat":
            await useGlobalChatStore.getState().updateThreadTitle(ref, trimmed);
            break;
          case "application":
            await updateApplication.mutateAsync({ id: ref, name: trimmed });
            break;
          case "project":
            await trpcClient.projects.update.mutate({ id: ref, name: trimmed });
            void trpcUtils.projects.list.invalidate();
            break;
          default: {
            const unhandled: never = strategy;
            throw new Error(`Unsupported rename strategy: ${unhandled}`);
          }
        }
        refreshDocumentLists();
      } catch (error) {
        setTitle(ref, type, currentName);
        addNotification({
          type: "error",
          alert: true,
          content: `Failed to rename document: ${error instanceof Error ? error.message : "Unknown error"}`
        });
      }
    },
    [
      workflowManagerStore,
      setTitle,
      updateApplication,
      trpcUtils,
      addNotification
    ]
  );
};
