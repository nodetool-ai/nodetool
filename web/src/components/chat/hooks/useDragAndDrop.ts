import { useState, useCallback } from "react";
import { Asset } from "../../../stores/ApiTypes";
import { DroppedFile } from "../types/chat.types";
import { useAssetGridStore } from "../../../stores/AssetGridStore";
import {
  deserializeDragData,
  hasExternalFiles,
  extractFiles
} from "../../../lib/dragdrop";

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

      // Use unified deserialization
      const dragData = deserializeDragData(e.dataTransfer);

      if (dragData && onAssetsDropped) {
        try {
          const droppedFiles: DroppedFile[] = [];
          
          // Handle multiple assets
          if (dragData.type === "assets-multiple") {
            const selectedIds = dragData.payload as string[];
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

          // Handle single asset
          if (droppedFiles.length === 0 && dragData.type === "asset") {
            const asset = dragData.payload as Asset;
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
          console.error("Failed to process dropped asset", err);
        }
      }

      // Handle external files
      if (hasExternalFiles(e.dataTransfer)) {
        const files = extractFiles(e.dataTransfer);
        if (files.length > 0) {
          onFilesDropped(files);
        }
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