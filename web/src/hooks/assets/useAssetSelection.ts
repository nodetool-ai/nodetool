import { useState, useCallback, useEffect } from "react";
import { useKeyPressedStore } from "../../stores/KeyPressedStore";
import { Asset } from "../../stores/ApiTypes";
import { useAssetGridStore } from "../../stores/AssetGridStore";

export const useAssetSelection = (sortedAssets: Asset[]) => {
  const { selectedAssetIds, setSelectedAssetIds } = useAssetGridStore(
    (state) => ({
      selectedAssetIds: state.selectedAssetIds,
      setSelectedAssetIds: state.setSelectedAssetIds
    })
  );
  const [lastSelectedAssetId, setLastSelectedAssetId] = useState<string | null>(
    null
  );

  const setCurrentAudioAsset = useAssetGridStore(
    (state) => state.setCurrentAudioAsset
  );

  const handleSelectAsset = useCallback(
    (assetId: string) => {
      const shiftKeyPressed = useKeyPressedStore.getState().isKeyPressed("shift");
      const controlKeyPressed = useKeyPressedStore.getState().isKeyPressed("control");
      const metaKeyPressed = useKeyPressedStore.getState().isKeyPressed("meta");
      const selectedAssetIndex = sortedAssets.findIndex(
        (asset) => asset.id === assetId
      );
      const lastSelectedIndex = lastSelectedAssetId
        ? sortedAssets.findIndex((asset) => asset.id === lastSelectedAssetId)
        : -1;

      const selectedAsset = sortedAssets.find((asset) => asset.id === assetId);
      const isAudio = selectedAsset?.content_type.match("audio") !== null;

      if (shiftKeyPressed && lastSelectedIndex !== -1) {
        const existingSelection = new Set(selectedAssetIds);
        const start = lastSelectedIndex;
        const end = selectedAssetIndex;
        const direction = start < end ? 1 : -1;

        for (let i = start; direction * i <= direction * end; i += direction) {
          existingSelection.add(sortedAssets[i].id);
        }

        const newSelectedIds = Array.from(existingSelection);
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
      sortedAssets,
      lastSelectedAssetId,
      selectedAssetIds,
      setSelectedAssetIds,
      setCurrentAudioAsset,
    ]
  );

  const handleSelectAllAssets = useCallback(() => {
    const allAssetIds = sortedAssets.map((asset) => asset.id);
    setSelectedAssetIds(allAssetIds);
    setLastSelectedAssetId(null);
  }, [setSelectedAssetIds, sortedAssets]);

  const handleDeselectAssets = useCallback(() => {
    setSelectedAssetIds([]);
    setLastSelectedAssetId(null);
  }, [setSelectedAssetIds]);

  useEffect(() => {
    if (selectedAssetIds.length === 0) {
      setCurrentAudioAsset(null);
    }
  }, [selectedAssetIds, setCurrentAudioAsset]);

  return {
    selectedAssetIds,
    setSelectedAssetIds,
    setCurrentAudioAsset,
    handleSelectAsset,
    handleSelectAllAssets,
    handleDeselectAssets,
  };
};
