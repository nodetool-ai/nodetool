import { useState, useCallback } from "react";
import { Asset } from "../../../stores/ApiTypes";
import { DroppedFile } from "../types/chat.types";
import { useAssetGridStore } from "../../../stores/AssetGridStore";

export const useDragAndDrop = (
  onFilesDropped: (files: File[]) => void,
  onAssetsDropped?: (files: DroppedFile[]) => void
) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const assetJson = e.dataTransfer.getData("asset");
      const selectedAssetIdsJson = e.dataTransfer.getData("selectedAssetIds");

      if ((assetJson || selectedAssetIdsJson) && onAssetsDropped) {
        try {
          const droppedFiles: DroppedFile[] = [];
          
          // Try to handle multiple assets first
          if (selectedAssetIdsJson) {
             const selectedIds: string[] = JSON.parse(selectedAssetIdsJson);
             const { filteredAssets, globalSearchResults } = useAssetGridStore.getState();
             // Combine sources to find assets. 
             // Note: filteredAssets might be only the current folder view.
             // If we are in global search, use globalSearchResults.
             // We can also try to find in selectedAssets if the store keeps them populated.
             const potentialAssets = [...filteredAssets, ...globalSearchResults, ...(useAssetGridStore.getState().selectedAssets || [])];
             
             const foundAssets = potentialAssets.filter(a => selectedIds.includes(a.id));
             // Deduplicate by ID
             const uniqueAssets = Array.from(new Map(foundAssets.map(item => [item.id, item])).values());
             
             uniqueAssets.forEach(asset => {
                if (asset.get_url) {
                    droppedFiles.push({
                        dataUri: asset.get_url,
                        type: asset.content_type || "application/octet-stream",
                        name: asset.name
                    });
                }
             });
          }

          // If no multiple assets found or processing failed, fallback to single asset
          if (droppedFiles.length === 0 && assetJson) {
              const asset: Asset = JSON.parse(assetJson);
              if (asset.get_url) {
                droppedFiles.push({
                  dataUri: asset.get_url,
                  type: asset.content_type || "application/octet-stream",
                  name: asset.name
                });
              }
          }

          if (droppedFiles.length > 0) {
              onAssetsDropped(droppedFiles);
              return;
          }

        } catch (err) {
          console.error("Failed to parse dropped asset", err);
        }
      }

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        onFilesDropped(files);
      }
    },
    [onFilesDropped, onAssetsDropped]
  );

  return {
    isDragging,
    handleDragOver,
    handleDragLeave,
    handleDrop
  };
};