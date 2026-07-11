import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AssetUpdate, useAssetStore } from "../stores/AssetStore";
import { useNotificationStore } from "../stores/NotificationStore";
import { useAssetGridStoreApi } from "../stores/AssetGridStore";
import { AssetList } from "../stores/ApiTypes";

export const useAssetUpdate = () => {
  const queryClient = useQueryClient();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const updateAsset = useAssetStore((state) => state.update);
  const gridStore = useAssetGridStoreApi();
  const performMutation = async (updates: AssetUpdate[]) => {
    await Promise.all(updates.map((asset) => updateAsset(asset)));
  };
  const mutation = useMutation({
    mutationFn: performMutation,
    onMutate: async (updates: AssetUpdate[]) => {
      const currentFolderId = gridStore.getState().currentFolderId;
      const queryKey = ["assets", { parent_id: currentFolderId }];

      // Cancel outgoing refetches so they don't overwrite the optimistic update
      await queryClient.cancelQueries({ queryKey });

      const previousData = queryClient.getQueryData<AssetList>(queryKey);

      // Immediately remove the moved assets from the current folder view
      const movedIds = new Set(updates.map((u) => u.id));
      queryClient.setQueryData<AssetList>(queryKey, (old: AssetList | undefined) => {
        if (!old) return old;
        return {
          ...old,
          assets: old.assets.filter(
            (a: { id: string }) => !movedIds.has(a.id)
          )
        };
      });

      return { previousData, currentFolderId };
    },
    onSuccess: (_data, updates) => {
      mutation.reset();
      addNotification({
        type: "info",
        alert: true,
        content: `${updates.length > 1 ? "Assets" : "Asset"} updated!`,
        dismissable: false,
      });
    },
    onError: (err, _updates, context) => {
      console.error("Failed to update asset(s):", err);
      if (context?.previousData !== undefined) {
        queryClient.setQueryData(
          ["assets", { parent_id: context.currentFolderId }],
          context.previousData
        );
      }
      addNotification({
        type: "error",
        alert: true,
        content: "Error updating asset.",
        dismissable: false,
      });
    },
    onSettled: (_data, _error, _updates, context) => {
      if (context?.currentFolderId !== undefined) {
        queryClient.invalidateQueries({
          queryKey: ["assets", { parent_id: context.currentFolderId }]
        });
      }
      queryClient.invalidateQueries({ queryKey: ["folderTree"] });
    },
  });

  return {
    mutation,
  };
};
