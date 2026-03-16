import { useState, useCallback } from "react";
import { Asset } from "../../../stores/ApiTypes";
import { DroppedFile } from "../types/chat.types";
import { useAssetGridStore } from "../../../stores/AssetGridStore";
import {
  deserializeDragData,
  hasExternalFiles,
  extractFiles
} from "../../../lib/dragdrop";

// Generate a unique ID for each file
const generateFileId = () => `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

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
                  id: generateFileId(),
                  dataUri: asset.get_url,
                  type: asset.content_type || "application/octet-stream",
                  name: asset.name
                });
              }
            });
          }

          // Handle single asset (direct asset drop or fallback from assets-multiple)
          if (droppedFiles.length === 0 && dragData.type === "asset") {
            const asset = dragData.payload as Asset;
            if (asset.get_url) {
              droppedFiles.push({
                id: generateFileId(),
                dataUri: asset.get_url,
                type: asset.content_type || "application/octet-stream",
                name: asset.name
              });
            }
          }

          // Fallback: if assets-multiple lookup failed, try the legacy "asset" key directly
          // This handles the case where asset IDs couldn't be found in stores
          if (droppedFiles.length === 0 && dragData.type === "assets-multiple") {
            const assetJson = e.dataTransfer.getData("asset");
            if (assetJson) {
              try {
                const asset: Asset = JSON.parse(assetJson);
                if (asset.get_url) {
                  droppedFiles.push({
                    id: generateFileId(),
                    dataUri: asset.get_url,
                    type: asset.content_type || "application/octet-stream",
                    name: asset.name
                  });
                }
              } catch {
                // Ignore parse errors
              }
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