import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

import { useAssetStore } from "../../stores/AssetStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import type { Asset } from "../../stores/ApiTypes";
import { ensureSketchDocumentForAsset } from "./ensureSketchDocumentForAsset";

export { SKETCH_DOCUMENT_METADATA_KEY } from "./ensureSketchDocumentForAsset";

/**
 * Open an image asset in the standalone sketch editor (the full-screen
 * `/sketch/:documentId` route). Reuses the asset's linked sketch document if it
 * has one, otherwise creates and links one seeded with the image. Saving inside
 * the editor renders back into this asset.
 */
export function useOpenImageInSketch() {
  const navigate = useNavigate();
  const updateAsset = useAssetStore((state) => state.update);

  return useCallback(
    async (asset: Asset) => {
      try {
        const documentId = await ensureSketchDocumentForAsset(
          asset,
          updateAsset
        );
        navigate(`/sketch/${documentId}`);
      } catch (error) {
        useNotificationStore.getState().addNotification({
          type: "error",
          alert: true,
          content: `Could not open image editor: ${
            error instanceof Error ? error.message : String(error)
          }`
        });
      }
    },
    [navigate, updateAsset]
  );
}
