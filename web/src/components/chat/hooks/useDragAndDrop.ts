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

/**
 * Fetch an asset URL and return a data: URI.
 * Handles relative paths (proxied via Vite in dev) and absolute URLs.
 * Falls back to the original URL string if fetch fails.
 */
async function assetUrlToDataUri(url: string, mimeType: string): Promise<string> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return url;
    const buf = new Uint8Array(await resp.arrayBuffer());
    // Use FileReader to safely encode arbitrary-size buffers (btoa + spread fails for large files)
    return await new Promise<string>((resolve) => {
      const blob = new Blob([buf], { type: mimeType });
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(url);
      reader.readAsDataURL(blob);
    });
  } catch {
    return url;
  }
}

async function assetToDroppedFile(asset: Asset): Promise<DroppedFile> {
  const url = asset.get_url ?? "";
  const mimeType = asset.content_type || "application/octet-stream";
  const dataUri = url ? await assetUrlToDataUri(url, mimeType) : url;
  return {
    id: generateFileId(),
    dataUri,
    type: mimeType,
    name: asset.name
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
            const { filteredAssets, globalSearchResults } = useAssetGridStore.getState();
            const potentialAssets = [...filteredAssets, ...globalSearchResults, ...(useAssetGridStore.getState().selectedAssets || [])];
            const foundAssets = potentialAssets.filter(a => selectedIds.includes(a.id));
            const uniqueAssets = Array.from(new Map(foundAssets.map(item => [item.id, item])).values());
            const resolved = await Promise.all(uniqueAssets.filter(a => a.get_url).map(assetToDroppedFile));
            droppedFiles.push(...resolved);
          }

          // Handle single asset
          if (droppedFiles.length === 0 && dragData.type === "asset") {
            const asset = dragData.payload as Asset;
            if (asset.get_url) {
              droppedFiles.push(await assetToDroppedFile(asset));
            }
          }

          // Fallback: legacy "asset" key when assets-multiple store lookup fails
          if (droppedFiles.length === 0 && dragData.type === "assets-multiple") {
            const assetJson = e.dataTransfer.getData("asset");
            if (assetJson) {
              try {
                const asset: Asset = JSON.parse(assetJson);
                if (asset.get_url) {
                  droppedFiles.push(await assetToDroppedFile(asset));
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