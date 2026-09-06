import { useMutation } from "@tanstack/react-query";
import { useAssetStore } from "../stores/AssetStore";
import { useNotificationStore } from "../stores/NotificationStore";

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

  const mutation = useMutation({
    mutationFn: performMutation,
    onSuccess: (data) => {
      mutation.reset();
      addNotification({
        type: "info",
        alert: true,
        content: `${
          data.deleted_asset_ids.length > 1 ? "Assets" : "Asset"
        } deleted!`,
        dismissable: false
      });
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
