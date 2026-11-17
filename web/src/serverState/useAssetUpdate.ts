import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AssetUpdate, useAssetStore } from "../stores/AssetStore";
import { useNotificationStore } from "../stores/NotificationStore";

export const useAssetUpdate = () => {
  const queryClient = useQueryClient();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const updateAsset = useAssetStore((state) => state.update);
  const mutation = useMutation({
    mutationFn: async (updates: AssetUpdate[]) => {
      await Promise.all(updates.map((asset) => updateAsset(asset)));
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
    onError: (err) => {
      console.error("Failed to update asset(s):", err);
      addNotification({
        type: "error",
        alert: true,
        content: "Error updating asset.",
        dismissable: false,
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
  });

  return {
    mutation,
  };
};
