import { useState, useCallback, useEffect, useMemo } from "react";
import { useKeyPressedStore } from "../../stores/KeyPressedStore";
import { Asset } from "../../stores/ApiTypes";
import { useAssetGridStore } from "../../stores/AssetGridStore";

export const useAssetSelection = (sortedAssets: Asset[]) => {
  const { selectedAssetIds, setSelectedAssetIds, setSelectedAssets } =
    useAssetGridStore((state) => ({
      selectedAssetIds: state.selectedAssetIds,
      setSelectedAssetIds: state.setSelectedAssetIds,
      setSelectedAssets: state.setSelectedAssets
    }));
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
  const updateSelection = useCallback(
    (assetIds: string[]) => {
      console.time(`🔄 updateSelection(${assetIds.length} assets)`);

      console.time("📝 setSelectedAssetIds");
      setSelectedAssetIds(assetIds);
      console.timeEnd("📝 setSelectedAssetIds");

      console.time("🔍 find selectedAssets");
      const selectedAssets = assetIds
        .map((id) => sortedAssets.find((asset) => asset.id === id))
        .filter(Boolean) as Asset[];
      console.timeEnd("🔍 find selectedAssets");

      console.time("💾 setSelectedAssets");
      setSelectedAssets(selectedAssets);
      console.timeEnd("💾 setSelectedAssets");

      console.timeEnd(`🔄 updateSelection(${assetIds.length} assets)`);
    },
    [setSelectedAssetIds, setSelectedAssets, sortedAssets]
  );

  const handleSelectAsset = useCallback(
    (assetId: string) => {
      console.time(`🎯 handleSelectAsset(${assetId})`);
      console.log(`🎯 Selecting asset: ${assetId}`);

      console.time("⌨️ key state checks");
      const keyState = useKeyPressedStore.getState();
      const shiftKeyPressed = keyState.isKeyPressed("shift");
      const controlKeyPressed = keyState.isKeyPressed("control");
      const metaKeyPressed = keyState.isKeyPressed("meta");
      console.timeEnd("⌨️ key state checks");

      console.time("🗺️ asset index lookups");
      const selectedAssetIndex = assetIndexMap.get(assetId) ?? -1;
      const lastSelectedIndex = lastSelectedAssetId
        ? assetIndexMap.get(lastSelectedAssetId) ?? -1
        : -1;
      console.timeEnd("🗺️ asset index lookups");

      console.time("🎵 audio asset logic");
      const selectedAsset = sortedAssets.find((asset) => asset.id === assetId);
      const isAudio = selectedAsset?.content_type.match("audio") !== null;
      console.timeEnd("🎵 audio asset logic");

      console.time("🔀 selection logic");
      if (shiftKeyPressed && lastSelectedIndex !== -1) {
        console.log("🔀 Range selection mode");
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
        console.log("🔀 Multi-select mode");
        const newAssetIds = selectedAssetIds.includes(assetId)
          ? selectedAssetIds.filter((id) => id !== assetId)
          : [...selectedAssetIds, assetId];
        updateSelection(newAssetIds);
      } else {
        console.log("🔀 Single select mode");
        if (selectedAssetIds[0] !== assetId) {
          updateSelection([assetId]);
        }
      }
      console.timeEnd("🔀 selection logic");

      setLastSelectedAssetId(assetId);

      console.time("🎧 audio asset setting");
      if (isAudio) {
        setCurrentAudioAsset(selectedAsset ? selectedAsset : null);
      } else {
        setCurrentAudioAsset(null);
      }
      console.timeEnd("🎧 audio asset setting");

      console.timeEnd(`🎯 handleSelectAsset(${assetId})`);
      console.log("🎯 Selection complete");
    },
    [
      assetIndexMap,
      lastSelectedAssetId,
      selectedAssetIds,
      updateSelection,
      setCurrentAudioAsset
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
