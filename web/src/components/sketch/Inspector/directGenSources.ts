import type { Layer } from "../types";

/**
 * Layers an image-to-image layer can start from: raster layers with painted
 * pixels or a placed image. A placed image (an upload, an asset) keeps its
 * pixels behind `imageReference` until they are loaded, so `data` alone would
 * miss the photo someone just uploaded to edit.
 */
export const directGenSourceLayers = (
  layers: readonly Layer[],
  generatedLayerId: string
): Layer[] =>
  layers.filter(
    (layer) =>
      layer.id !== generatedLayerId &&
      layer.type === "raster" &&
      (layer.data !== null || Boolean(layer.imageReference?.uri))
  );
