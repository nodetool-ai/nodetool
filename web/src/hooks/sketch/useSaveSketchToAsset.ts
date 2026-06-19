import { useCallback, useState } from "react";

import { useSketchCanvasRefStore } from "../../stores/sketch/SketchCanvasRefStore";
import { useAssetStore } from "../../stores/AssetStore";
import { useNotificationStore } from "../../stores/NotificationStore";

/**
 * Flatten the live sketch composite and write it into an image asset.
 *
 * The sketch document autosaves on its own; this is the explicit "render into
 * the asset" action shared by the standalone editor's header pill and the
 * embedded workspace image tab. Reads pixels from whichever SketchEditor is
 * currently mounted (via the global canvas-ref store) and overwrites the
 * asset's bytes — metadata (the sketch link) is left untouched by the partial
 * update.
 */
export function useSaveSketchToAsset(assetId: string | undefined): Readonly<{
  save: () => Promise<void>;
  saving: boolean;
}> {
  const updateAsset = useAssetStore((state) => state.update);
  const invalidateQueries = useAssetStore((state) => state.invalidateQueries);
  const [saving, setSaving] = useState(false);

  const save = useCallback(async () => {
    if (!assetId) return;
    const flatten = useSketchCanvasRefStore.getState().flattenToDataUrl;
    const dataUrl = flatten?.();
    if (!dataUrl) {
      useNotificationStore.getState().addNotification({
        type: "error",
        content: "Nothing to save yet — the canvas is still loading."
      });
      return;
    }
    const base64 = dataUrl.split(",")[1] ?? "";
    setSaving(true);
    try {
      await updateAsset({
        id: assetId,
        data: base64,
        data_encoding: "base64"
      });
      invalidateQueries(["asset", assetId]);
      useNotificationStore.getState().addNotification({
        type: "success",
        content: "Saved edits to image."
      });
    } catch (error) {
      useNotificationStore.getState().addNotification({
        type: "error",
        alert: true,
        content: `Failed to save image: ${
          error instanceof Error ? error.message : String(error)
        }`
      });
    } finally {
      setSaving(false);
    }
  }, [assetId, updateAsset, invalidateQueries]);

  return { save, saving };
}
