import { useMutation } from "@tanstack/react-query";
import { useAssetStore } from "../stores/AssetStore";
import { useNotificationStore } from "../stores/NotificationStore";
import {
  useWorkspaceTabsStore,
  type WorkspaceTabType
} from "../stores/WorkspaceTabsStore";

/** Tab types whose `ref` is an asset id (see `assetTabType`). */
const ASSET_TAB_TYPES: ReadonlySet<WorkspaceTabType> = new Set([
  "image",
  "svg",
  "audio",
  "model3d",
  "text"
]);

/**
 * Close the tabs that show a deleted asset. Left open, a tab reads "Failed to
 * load text asset", which looks like a fault rather than the deletion the user
 * just confirmed.
 */
function closeDeletedAssetTabs(deletedIds: readonly string[]): void {
  const deleted = new Set(deletedIds);
  const { tabs, closeTab } = useWorkspaceTabsStore.getState();
  for (const tab of tabs) {
    if (ASSET_TAB_TYPES.has(tab.type) && deleted.has(tab.ref)) {
      closeTab(tab.id);
    }
  }
}

export const useAssetDeletion = () => {
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const deleteAsset = useAssetStore((state) => state.delete);

  const performMutation = async (
    assets: string[]
  ): Promise<{ deleted_asset_ids: string[] }> => {
    const deletedIds = await Promise.all(assets.map((id) => deleteAsset(id)));
    const flattenedIds = deletedIds.flat();
    return { deleted_asset_ids: flattenedIds };
  };

  // The caller confirms success with its own count ("Deleted 1 file"), so a
  // second toast here would only repeat it.
  const mutation = useMutation({
    mutationFn: performMutation,
    onSuccess: (data) => {
      mutation.reset();
      closeDeletedAssetTabs(data.deleted_asset_ids);
    },
    onError: () => {
      addNotification({
        type: "error",
        alert: true,
        content: "Error deleting assets.",
        dismissable: false
      });
    }
  });

  return {
    mutation
  };
};
