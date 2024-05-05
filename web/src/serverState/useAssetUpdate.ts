import { useMutation } from "react-query";
import { AssetUpdate, useAssetStore } from "../stores/AssetStore";
import { useState } from "react";
import { useNotificationStore } from "../stores/NotificationStore";
import { AssetUpdateRequest } from "../stores/ApiTypes";

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
  const mutation = useMutation(performMutation, {
    onSuccess: () => {
      addNotification({
        type: "info",
        alert: true,
        content: `${
          Object.keys(assets).length > 1 ? "Assets" : "Asset"
        } renamed!`,
        dismissable: false
      });
    },
    onError: () => {
      addNotification({
        type: "error",
        alert: true,
        content: "Error renaming assets.",
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
