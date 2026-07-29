import { useCallback, useState } from "react";

import { useSketchCanvasRefStore } from "../../stores/sketch/SketchCanvasRefStore";
import { useSketchInstance } from "../../stores/sketch/SketchInstance";
import { useAssetStore } from "../../stores/AssetStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { trpcClient } from "../../trpc/client";

/**
 * Flatten the live sketch composite into a NEW image asset in a chosen folder
 * and link the two so the PNG traces back to this sketch: asset → sketch via
 * `sketch_document_id`, sketch → asset via `thumbnailAssetId` (mirroring
 * {@link ensureSketchDocumentForAsset}'s bidirectional link). Because the new
 * asset carries `sketch_document_id`, reopening it in the image editor resumes
 * this exact sketch rather than creating a fresh document.
 *
 * Distinct from {@link useSaveSketchToAsset}, which overwrites the bytes of an
 * existing asset rather than creating a new one.
 */
export function useSaveSketchAsAsset(): Readonly<{
  saveAsAsset: (folderId: string | null) => Promise<void>;
  saving: boolean;
}> {
  const instance = useSketchInstance();
  const createAsset = useAssetStore((state) => state.createAsset);
  const updateAsset = useAssetStore((state) => state.update);
  const [saving, setSaving] = useState(false);

  const saveAsAsset = useCallback(
    async (folderId: string | null) => {
      const session = instance.session.getState();
      const documentId = session.documentId;
      if (!documentId) return;

      const flatten = useSketchCanvasRefStore.getState().flattenToDataUrl;
      const dataUrl = flatten?.();
      if (!dataUrl) {
        useNotificationStore.getState().addNotification({
          type: "error",
          content: "Nothing to save yet — the canvas is still loading."
        });
        return;
      }

      setSaving(true);
      try {
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], `${session.name || "Sketch"}.png`, {
          type: "image/png"
        });
        const asset = await createAsset(
          file,
          undefined,
          folderId ?? undefined,
          undefined,
          "file"
        );
        // Link the exported PNG back to this sketch (and give the sketch a
        // thumbnail), so editing the asset later resumes this document.
        await updateAsset({ id: asset.id, sketch_document_id: documentId });
        await trpcClient.sketch.update.mutate({
          id: documentId,
          thumbnailAssetId: asset.id
        });
        useNotificationStore.getState().addNotification({
          type: "success",
          content: "Saved sketch as image asset."
        });
      } catch (error) {
        useNotificationStore.getState().addNotification({
          type: "error",
          alert: true,
          content: `Failed to save asset: ${
            error instanceof Error ? error.message : String(error)
          }`
        });
      } finally {
        setSaving(false);
      }
    },
    [instance, createAsset, updateAsset]
  );

  return { saveAsAsset, saving };
}
