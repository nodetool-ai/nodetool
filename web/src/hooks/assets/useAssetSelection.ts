import { useState, useCallback, useEffect } from "react";
import { useKeyPressedStore } from "../../stores/KeyPressedStore";
import { Asset } from "../../stores/ApiTypes";
import useSessionStateStore from "../../stores/SessionStateStore";

export const useAssetSelection = (sortedAssets: Asset[]) => {
  // const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const selectedAssetIds = useSessionStateStore(
    (state) => state.selectedAssetIds
  );
  const setSelectedAssetIds = useSessionStateStore(
    (state) => state.setSelectedAssetIds
  );
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
      shiftKeyPressed,
      controlKeyPressed,
      metaKeyPressed,
      setSelectedAssetIds,
      selectedAssetIds,
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
    handleDeselectAssets,
  };
};
