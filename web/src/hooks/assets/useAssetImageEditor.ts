/**
 * Hook for editing and saving images in the asset system.
 * 
 * Handles the flow of:
 * 1. Converting edited image blob to base64
 * 2. Updating the asset via AssetStore
 * 3. Invalidating cache and showing notifications
 */

import { useCallback } from "react";
import { useAssetStore } from "../../stores/AssetStore";
import { Asset } from "../../stores/ApiTypes";
import log from "loglevel";

interface UseAssetImageEditorResult {
  saveEditedImage: (
    asset: Asset,
    blob: Blob
  ) => Promise<void>;
}

/**
 * Convert a Blob to a base64 data URL
 */
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

/**
 * Hook for editing images from the asset panel.
 * Provides functionality to save edited images back to the asset backend.
 */
export const useAssetImageEditor = (): UseAssetImageEditorResult => {
  const updateAsset = useAssetStore((state) => state.update);
  const invalidateQueries = useAssetStore((state) => state.invalidateQueries);

  /**
   * Save the edited image back to the asset backend.
   * Updates the existing asset with the new image data.
   * 
   * @param asset - The original asset being edited
   * @param blob - The edited image as a Blob
   */
  const saveEditedImage = useCallback(
    async (asset: Asset, blob: Blob) => {
      try {
        log.info(`[useAssetImageEditor] Saving edited image for asset: ${asset.id}`);

        // Convert blob to base64 data URL
        const base64Data = await blobToBase64(blob);

        // Update the asset with the new image data
        await updateAsset({
          id: asset.id,
          data: base64Data
        });

        // Invalidate cache to refresh the asset display
        invalidateQueries(["assets", asset.id]);
        if (asset.parent_id && asset.parent_id !== "") {
          invalidateQueries(["assets", { parent_id: asset.parent_id }]);
        }

        log.info(`[useAssetImageEditor] Successfully saved edited image for asset: ${asset.id}`);
      } catch (error) {
        log.error("[useAssetImageEditor] Failed to save edited image:", error);
        throw error;
      }
    },
    [updateAsset, invalidateQueries]
  );

  return {
    saveEditedImage
  };
};
