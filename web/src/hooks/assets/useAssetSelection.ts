import { useState, useCallback, useEffect } from "react";
import { useKeyPressedStore } from "../../stores/KeyPressedStore";
import { Asset } from "../../stores/ApiTypes";

export const useAssetSelection = (sortedAssets: Asset[]) => {
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [lastSelectedAssetId, setLastSelectedAssetId] = useState<string | null>(
    null
  );
  const [currentAudioAsset, setCurrentAudioAsset] = useState<Asset | null>(
    null
  );

  const shiftKeyPressed = useKeyPressedStore((state) =>
    state.isKeyPressed("shift")
  );
  const controlKeyPressed = useKeyPressedStore((state) =>
    state.isKeyPressed("control")
  );
  const metaKeyPressed = useKeyPressedStore((state) =>
    state.isKeyPressed("meta")
  );

  const handleSelectAsset = useCallback(
    (assetId: string) => {
      const selectedAssetIndex = sortedAssets.findIndex(
        (asset) => asset.id === assetId
      );
      const lastSelectedIndex = lastSelectedAssetId
        ? sortedAssets.findIndex((asset) => asset.id === lastSelectedAssetId)
        : -1;

      const selectedAsset = sortedAssets.find((asset) => asset.id === assetId);
      const isAudio = selectedAsset?.content_type.match("audio") !== null;

      if (shiftKeyPressed && lastSelectedIndex !== -1) {
        const start = Math.min(selectedAssetIndex, lastSelectedIndex);
        const end = Math.max(selectedAssetIndex, lastSelectedIndex);
        const newSelectedIds = sortedAssets
          .slice(start, end + 1)
          .map((asset) => asset.id);
        setSelectedAssetIds(newSelectedIds);
      } else if (controlKeyPressed || metaKeyPressed) {
        const newAssetIds = selectedAssetIds.includes(assetId)
          ? selectedAssetIds.filter((id) => id !== assetId)
          : [...selectedAssetIds, assetId];
        setSelectedAssetIds(newAssetIds);
      } else {
        if (selectedAssetIds[0] !== assetId) {
          setSelectedAssetIds([assetId]);
        }
      }

      setLastSelectedAssetId(assetId);

      if (isAudio) {
        setCurrentAudioAsset(selectedAsset ? selectedAsset : null);
      } else {
        setCurrentAudioAsset(null);
      }
    },
    [
      lastSelectedAssetId,
      shiftKeyPressed,
      controlKeyPressed,
      metaKeyPressed,
      selectedAssetIds,
      sortedAssets
    ]
  );

  const handleSelectAllAssets = useCallback(() => {
    const allAssetIds = sortedAssets.map((asset) => asset.id);
    setSelectedAssetIds(allAssetIds);
    setLastSelectedAssetId(null);
  }, [sortedAssets]);

  const handleDeselectAssets = useCallback(() => {
    setSelectedAssetIds([]);
    setLastSelectedAssetId(null);
  }, []);

  useEffect(() => {
    if (selectedAssetIds.length === 0) {
      setCurrentAudioAsset(null);
    }
  }, [selectedAssetIds]);

  return {
    selectedAssetIds,
    setSelectedAssetIds,
    currentAudioAsset,
    handleSelectAsset,
    handleSelectAllAssets,
    handleDeselectAssets
  };
};
