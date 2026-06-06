import type { Layer } from "./types";

export interface MergeSelectedLayersPlan {
  mergeOrder: string[];
  mergePairs: Array<{ upperLayerId: string; lowerLayerId: string }>;
  survivingLayerId: string;
}

/**
 * Resolve whether the current multi-layer selection can be merged by repeatedly
 * applying the existing "merge down" primitive.
 *
 * The current runtime/store contract only supports merging an upper layer into
 * its immediate lower neighbor, so merge-selected stays intentionally narrow:
 * contiguous, non-group, unlocked siblings under the same parent.
 */
export function getMergeSelectedLayersPlan(
  layers: Layer[],
  selectedLayerIds: string[]
): MergeSelectedLayersPlan | null {
  if (selectedLayerIds.length < 2) {
    return null;
  }

  const selectedSet = new Set(selectedLayerIds);
  const selectedLayers = layers.filter((layer) => selectedSet.has(layer.id));
  if (selectedLayers.length !== selectedSet.size) {
    return null;
  }

  const firstParentId = selectedLayers[0]?.parentId ?? null;
  if (
    selectedLayers.some(
      (layer) =>
        layer.type === "group" ||
        layer.locked ||
        (layer.parentId ?? null) !== firstParentId
    )
  ) {
    return null;
  }

  const indices: number[] = [];
  for (let i = 0; i < layers.length; i++) {
    if (selectedSet.has(layers[i].id)) {
      indices.push(i);
    }
  }

  if (indices.some((index) => index < 0)) {
    return null;
  }

  for (let i = 1; i < indices.length; i += 1) {
    if (indices[i] !== indices[i - 1] + 1) {
      return null;
    }
  }

  const orderedIds = indices.map((index) => layers[index].id);
  const mergeOrder = [...orderedIds].reverse().slice(0, -1);
  return {
    mergeOrder,
    mergePairs: mergeOrder.map((upperLayerId) => {
      const upperIndex = orderedIds.indexOf(upperLayerId);
      return {
        upperLayerId,
        lowerLayerId: orderedIds[upperIndex - 1]
      };
    }),
    survivingLayerId: orderedIds[0],
  };
}
