import { useState, useCallback } from "react";
import { Asset } from "../../../stores/ApiTypes";
import { DroppedFile } from "../types/chat.types";
import { useAssetGridStore } from "../../../stores/AssetGridStore";
import {
  deserializeDragData,
  hasExternalFiles,
  extractFiles,
  resolveAssetsMultiple
} from "../../../lib/dragdrop";
import { assetToUri } from "../../node_types/editing/promptComposer/promptTokens";

// Generate a unique ID for each file
const generateFileId = () => `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

/**
 * Build a {@link DroppedFile} that references the asset by its
 * `asset://<id>.<ext>` URI rather than its bytes. The server dereferences the
 * URI before the provider call, so the browser doesn't have to download the
 * asset just to re-upload it inline (often megabytes for an image, hundreds for
 * a video). The asset's `get_url` rides along as `dataUri` purely so the file
 * preview tile can render a thumbnail.
 */
function assetToDroppedFile(asset: Asset): DroppedFile {
  const mimeType = asset.content_type || "application/octet-stream";
  return {
    id: generateFileId(),
    dataUri: asset.thumb_url || asset.get_url || "",
    type: mimeType,
    name: asset.name,
    assetUri: assetToUri(asset)
  };
}

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
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const dragData = deserializeDragData(e.dataTransfer);

      if (dragData && onAssetsDropped) {
        try {
          const droppedFiles: DroppedFile[] = [];

          // Handle multiple assets
          if (dragData.type === "assets-multiple") {
            const selectedIds = dragData.payload as string[];
            const { filteredAssets, globalSearchResults, selectedAssets } =
              useAssetGridStore.getState();
            const fallbackAssets = [
              ...filteredAssets,
              ...globalSearchResults,
              ...(selectedAssets || [])
            ];
            const uniqueAssets = resolveAssetsMultiple(
              selectedIds,
              dragData.metadata?.assets,
              fallbackAssets
            );
            for (const asset of uniqueAssets) {
              droppedFiles.push(assetToDroppedFile(asset));
            }
          }

          // Handle single asset
          if (droppedFiles.length === 0 && dragData.type === "asset") {
            const asset = dragData.payload as Asset;
            droppedFiles.push(assetToDroppedFile(asset));
          }

          // Fallback: legacy "asset" key when assets-multiple store lookup fails
          if (droppedFiles.length === 0 && dragData.type === "assets-multiple") {
            const assetJson = e.dataTransfer.getData("asset");
            if (assetJson) {
              try {
                const parsed: unknown = JSON.parse(assetJson);
                if (
                  typeof parsed === "object" &&
                  parsed !== null &&
                  "id" in parsed &&
                  typeof (parsed as { id: unknown }).id === "string"
                ) {
                  droppedFiles.push(assetToDroppedFile(parsed as Asset));
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