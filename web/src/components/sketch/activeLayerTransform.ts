import type { LayerTransform, SketchDocument } from "./types";

export interface LayerTransformPreview {
  layerId: string;
  transform: LayerTransform;
}

export function resolveDisplayedActiveLayerTransform(
  document: SketchDocument,
  preview: LayerTransformPreview | null
): LayerTransform {
  if (preview && preview.layerId === document.activeLayerId) {
    return preview.transform;
  }

  const activeLayer = document.layers.find((layer) => layer.id === document.activeLayerId);
  return activeLayer?.transform ?? { x: 0, y: 0 };
}
