import { useMutation } from "@tanstack/react-query";
import { useAssetStore } from "../hooks/AssetStore";
import { useState } from "react";
import { useNotificationStore } from "../stores/NotificationStore";

export const useAssetDeletion = () => {
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const deleteAsset = useAssetStore((state) => state.delete);
  const [assets, setAssets] = useState<string[]>([]);
  const performMutation = async (assets: string[]) => {
    setAssets(assets);
    await Promise.all(assets.map((id) => deleteAsset(id)));
  };
  const mutation = useMutation({
    mutationFn: performMutation,
    onSuccess: () => {
      mutation.reset();
      addNotification({
        type: "info",
        alert: true,
        content: `${assets.length > 1 ? "Assets" : "Asset"} deleted!`,
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
    },
    onSettled: () => {
      setAssets([]);
    }
  });

  return {
    mutation
  };
};
