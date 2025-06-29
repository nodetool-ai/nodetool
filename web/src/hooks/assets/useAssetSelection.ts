import { useState, useCallback, useEffect, useMemo } from "react";
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

  // Create a Map for O(1) asset index lookups instead of O(n) findIndex
  const assetIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    sortedAssets.forEach((asset, index) => {
      map.set(asset.id, index);
    });
    return map;
  }, [sortedAssets]);

  const setCurrentAudioAsset = useAssetGridStore(
    (state) => state.setCurrentAudioAsset
  );

  const handleSelectAsset = useCallback(
    (assetId: string) => {
      const keyState = useKeyPressedStore.getState();
      const shiftKeyPressed = keyState.isKeyPressed("shift");
      const controlKeyPressed = keyState.isKeyPressed("control");
      const metaKeyPressed = keyState.isKeyPressed("meta");
      const selectedAssetIndex = assetIndexMap.get(assetId) ?? -1;
      const lastSelectedIndex = lastSelectedAssetId
        ? assetIndexMap.get(lastSelectedAssetId) ?? -1
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
      assetIndexMap,
      lastSelectedAssetId,
      selectedAssetIds,
      setSelectedAssetIds,
      setCurrentAudioAsset
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
    handleDeselectAssets
  };
};
