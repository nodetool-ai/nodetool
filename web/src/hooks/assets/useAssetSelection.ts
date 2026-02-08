import { useState, useCallback, useEffect, useMemo } from "react";
import { shallow } from "zustand/shallow";
import { useKeyPressedStore } from "../../stores/KeyPressedStore";
import { Asset } from "../../stores/ApiTypes";
import { useAssetGridStore } from "../../stores/AssetGridStore";

export const useAssetSelection = (sortedAssets: Asset[]) => {
  const { selectedAssetIds, setSelectedAssetIds, setSelectedAssets } =
    useAssetGridStore(
      (state) => ({
        selectedAssetIds: state.selectedAssetIds,
        setSelectedAssetIds: state.setSelectedAssetIds,
        setSelectedAssets: state.setSelectedAssets
      }),
      shallow
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

  // Helper function to update both selectedAssetIds and selectedAssets efficiently
  // Uses assetIndexMap for O(1) lookups instead of O(n) find()
  const updateSelection = useCallback(
    (assetIds: string[]) => {
      setSelectedAssetIds(assetIds);
      const selectedAssets = assetIds
        .map((id) => {
          const index = assetIndexMap.get(id);
          return index !== undefined ? sortedAssets[index] : null;
        })
        .filter(Boolean) as Asset[];
      setSelectedAssets(selectedAssets);
    },
    [setSelectedAssetIds, setSelectedAssets, sortedAssets, assetIndexMap]
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

      // Use assetIndexMap for O(1) lookup instead of O(n) find()
      const assetIndex = assetIndexMap.get(assetId);
      const selectedAsset = assetIndex !== undefined ? sortedAssets[assetIndex] : undefined;
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
        updateSelection(newSelectedIds);
      } else if (controlKeyPressed || metaKeyPressed) {
        const newAssetIds = selectedAssetIds.includes(assetId)
          ? selectedAssetIds.filter((id) => id !== assetId)
          : [...selectedAssetIds, assetId];
        updateSelection(newAssetIds);
      } else {
        if (selectedAssetIds[0] !== assetId) {
          updateSelection([assetId]);
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
      assetIndexMap,
      lastSelectedAssetId,
      selectedAssetIds,
      updateSelection,
      setCurrentAudioAsset,
      sortedAssets
    ]
  );

  const handleSelectAllAssets = useCallback(() => {
    const allAssetIds = sortedAssets.map((asset) => asset.id);
    updateSelection(allAssetIds);
    setLastSelectedAssetId(null);
  }, [updateSelection, sortedAssets]);

  const handleDeselectAssets = useCallback(() => {
    updateSelection([]);
    setLastSelectedAssetId(null);
  }, [updateSelection]);

  useEffect(() => {
    if (selectedAssetIds.length === 0) {
      setCurrentAudioAsset(null);
    }
  }, [selectedAssetIds, setCurrentAudioAsset]);

  return {
    selectedAssetIds,
    handleSelectAsset,
    handleSelectAllAssets,
    handleDeselectAssets
  };
};
