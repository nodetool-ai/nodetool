import { useMutation } from "@tanstack/react-query";
import { AssetUpdate, useAssetStore } from "../hooks/AssetStore";
import { useState } from "react";
import { useNotificationStore } from "../stores/NotificationStore";

export const useAssetUpdate = () => {
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const updateAsset = useAssetStore((state) => state.update);
  const [assets, setAssets] = useState<AssetUpdate[]>([]);
  const performMutation = async (assets: AssetUpdate[]) => {
    setAssets(assets);
    await Promise.all(assets.map((asset) => updateAsset(asset)));
  };
  const mutation = useMutation({
    mutationFn: performMutation,
    onSuccess: () => {
      mutation.reset();
      addNotification({
        type: "info",
        alert: true,
        content: `${Object.keys(assets).length > 1 ? "Assets" : "Asset"
          } updated!`,
        dismissable: false
      });
    },
    onError: () => {
      addNotification({
        type: "error",
        alert: true,
        content: "Error updating asset.",
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
