import { useSyncExternalStore } from "react";
import { useSketchStore } from "./state";
import type { LayerTransform, SketchDocument } from "./types";
import { IDENTITY_AFFINE } from "./types";

export interface LayerTransformPreview {
  layerId: string;
  transform: LayerTransform;
}

let activeLayerTransformPreview: LayerTransformPreview | null = null;
const listeners = new Set<() => void>();

function emitPreviewChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

function subscribeToActiveLayerTransformPreview(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getActiveLayerTransformPreviewSnapshot(): LayerTransformPreview | null {
  return activeLayerTransformPreview;
}

export function setActiveLayerTransformPreview(preview: LayerTransformPreview): void {
  activeLayerTransformPreview = preview;
  emitPreviewChange();
}

export function clearActiveLayerTransformPreview(): void {
  if (activeLayerTransformPreview == null) {
    return;
  }
  activeLayerTransformPreview = null;
  emitPreviewChange();
}

export function resolveDisplayedActiveLayerTransform(
  document: SketchDocument,
  preview: LayerTransformPreview | null
): LayerTransform {
  if (preview && preview.layerId === document.activeLayerId) {
    return preview.transform;
  }

  const activeLayer = document.layers.find((layer) => layer.id === document.activeLayerId);
  return activeLayer?.transform ?? { ...IDENTITY_AFFINE };
}

export function useDisplayedActiveLayerTransform(): LayerTransform {
  const document = useSketchStore((s) => s.document);
  const preview = useSyncExternalStore(
    subscribeToActiveLayerTransformPreview,
    getActiveLayerTransformPreviewSnapshot,
    getActiveLayerTransformPreviewSnapshot
  );
  return resolveDisplayedActiveLayerTransform(document, preview);
}
