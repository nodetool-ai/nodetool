/**
 * The image flow's upload path (PRD § 10.1): an uploaded picture becomes the
 * document's first layer and the flow ends there.
 *
 * There is nothing left to refine once a creator has brought their own
 * picture, so the stage goes straight to `done` and the editor takes over
 * (criterion 1). The layer holds an `asset://` reference rather than inline
 * pixels — the same rule `buildSeededImageDocument` follows, which is what
 * keeps the persisted document small enough to autosave.
 */

import { useCallback, useState } from "react";

import { useSketchStore } from "../../components/sketch/state/useSketchStore";
import { useAssetStore } from "../../stores/AssetStore";
import { getAssetUrl } from "../../utils/assetHelpers";

/** Natural size of a picked file, measured before it is placed. */
const measure = (file: File): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file could not be read as an image."));
    };
    image.src = url;
  });

export interface UploadFirstLayerResult {
  /**
   * Upload the file, put it on the document's first layer, and finish the
   * flow. Resolves `false` when the upload was refused; the reason is in
   * `error`.
   */
  uploadFirstLayer: (file: File) => Promise<boolean>;
  uploading: boolean;
  error: string | null;
  clearError: () => void;
}

export function useUploadFirstLayer(
  onFinish?: () => void
): UploadFirstLayerResult {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clearError = useCallback(() => setError(null), []);

  const uploadFirstLayer = useCallback(
    async (file: File): Promise<boolean> => {
      setError(null);
      setUploading(true);
      try {
        const size = await measure(file);
        const asset = await useAssetStore
          .getState()
          .createAsset(file, undefined, undefined, undefined, "file");
        const uri = getAssetUrl(asset) ?? `asset://${asset.id}`;
        const sketch = useSketchStore.getState();
        const first = sketch.document.layers[0];
        if (!first) {
          setError("This document has no layer to place the image on.");
          return false;
        }
        sketch.resizeCanvas(size.width, size.height);
        const withImage = useSketchStore.getState().document;
        useSketchStore.getState().setDocument({
          ...withImage,
          // Stage only: whatever they typed before choosing to upload stays on
          // the document, so a later flow (or the agent) still has the words.
          setup: { brief: "", ...withImage.setup, stage: "done" },
          layers: withImage.layers.map((layer) =>
            layer.id === first.id
              ? {
                  ...layer,
                  name: file.name,
                  contentBounds: { x: 0, y: 0, ...size },
                  imageReference: {
                    uri,
                    naturalWidth: size.width,
                    naturalHeight: size.height,
                    objectFit: "contain"
                  }
                }
              : layer
          )
        });
        onFinish?.();
        return true;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        return false;
      } finally {
        setUploading(false);
      }
    },
    [onFinish]
  );

  return { uploadFirstLayer, uploading, error, clearError };
}

export default useUploadFirstLayer;
