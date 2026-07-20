/**
 * renderLayerToAsset
 *
 * Render a sketch layer — or the flattened composite of all visible layers — to
 * a PNG and upload it as a throwaway ("temporary") asset, returning its id and
 * URL.
 *
 * These uploads are ordinary assets (there is no server-side TTL); "temporary"
 * means the caller owns their lifetime and should delete them once consumed,
 * mirroring the inpaint / direct-gen source-image uploads. Use
 * {@link deleteRenderedAsset} for best-effort cleanup.
 *
 * The composite prefers the live canvas (`flattenToDataUrl`, so unsaved strokes
 * are included) and falls back to re-flattening the serialized document. A
 * single layer is rendered from its committed raster data via `exportLayer`.
 */

import {
  canvasToBlob,
  exportLayer,
  flattenDocument
} from "../../components/sketch/serialization";
import type { SketchDocument } from "../../components/sketch/types";
import { useAssetStore } from "../../stores/AssetStore";
import { getAssetUrl } from "../../utils/assetHelpers";

export interface RenderedLayerAsset {
  /** Uploaded asset id. */
  assetId: string;
  /** Best-effort resolvable URL for the asset (falls back to asset://). */
  url: string;
  /** Rendered image width (canvas width). */
  width: number;
  /** Rendered image height (canvas height). */
  height: number;
  /** null for the composite; otherwise the rendered layer id. */
  layerId: string | null;
  /** null for the composite; otherwise the rendered layer name. */
  layerName: string | null;
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

/** Sanitize a layer name into a safe file base. */
function safeBase(name: string): string {
  const trimmed = name.trim().replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "");
  return trimmed || "layer";
}

export interface RenderLayerToAssetParams {
  doc: SketchDocument;
  /** Layer id to render, or null for the flattened composite. */
  layerId: string | null;
  /** Live-canvas flatten getter, preferred for the composite when available. */
  flattenToDataUrl?: (() => string | null) | null;
  /** Optional override for the uploaded asset's file base name. */
  name?: string;
}

/**
 * Render the target and upload it as a temporary asset. Throws when the layer
 * is missing/empty or the canvas cannot be rendered.
 */
export async function renderLayerToAsset(
  params: RenderLayerToAssetParams
): Promise<RenderedLayerAsset> {
  const { doc, layerId, flattenToDataUrl, name } = params;
  const width = doc.canvas.width;
  const height = doc.canvas.height;

  let blob: Blob;
  let layerName: string | null = null;
  let fileBase: string;

  if (layerId === null) {
    // Composite: prefer the live canvas so in-flight strokes are captured.
    const liveDataUrl = flattenToDataUrl?.() ?? null;
    if (liveDataUrl) {
      blob = await dataUrlToBlob(liveDataUrl);
    } else {
      const canvas = await flattenDocument(doc);
      blob = await canvasToBlob(canvas);
    }
    fileBase = safeBase(name ?? "composite");
  } else {
    const layer = doc.layers.find((l) => l.id === layerId);
    if (!layer) {
      throw new Error(`Layer not found in the document: ${layerId}`);
    }
    layerName = layer.name;
    const canvas = await exportLayer(doc, layerId);
    if (!canvas) {
      throw new Error(`Layer "${layer.name}" has no pixel data to render.`);
    }
    blob = await canvasToBlob(canvas);
    fileBase = safeBase(name ?? layer.name);
  }

  const file = new File([blob], `${fileBase}.png`, {
    type: blob.type || "image/png"
  });
  const asset = await useAssetStore
    .getState()
    .createAsset(file, undefined, undefined, undefined, "file");

  return {
    assetId: asset.id,
    url: getAssetUrl(asset) ?? `asset://${asset.id}.png`,
    width,
    height,
    layerId,
    layerName
  };
}

export interface RenderLayersMergedParams {
  doc: SketchDocument;
  /** Layer ids to composite together, in any order. */
  layerIds: string[];
  /** Optional override for the uploaded asset's file base name. */
  name?: string;
}

/**
 * Composite a subset of layers into a single PNG and upload it as a temporary
 * asset. The named layers are drawn bottom-to-top in their original document
 * order, honoring each layer's opacity and blend mode; their group nesting is
 * flattened away (parents ignored) so the result is exactly those layers over
 * transparency. Throws when a layer is missing or none of them have pixels.
 */
export async function renderLayersMerged(
  params: RenderLayersMergedParams
): Promise<RenderedLayerAsset> {
  const { doc, layerIds, name } = params;
  if (layerIds.length === 0) {
    throw new Error("renderLayersMerged requires at least one layer id.");
  }

  const idSet = new Set(layerIds);
  for (const id of layerIds) {
    if (!doc.layers.some((l) => l.id === id)) {
      throw new Error(`Layer not found in the document: ${id}`);
    }
  }

  // Keep original document order (bottom → top) and render each selected layer
  // at root level so its own opacity/blend apply without ancestor-group state.
  const selected = doc.layers
    .filter((l) => idSet.has(l.id))
    .map((l) => ({ ...l, parentId: null, visible: true }));
  if (!selected.some((l) => l.data)) {
    throw new Error("None of the selected layers have pixel data to render.");
  }

  const filteredDoc: SketchDocument = {
    ...doc,
    maskLayerId: null,
    layers: selected
  };
  const canvas = await flattenDocument(filteredDoc);
  const blob = await canvasToBlob(canvas);

  const file = new File([blob], `${safeBase(name ?? "layers")}.png`, {
    type: blob.type || "image/png"
  });
  const asset = await useAssetStore
    .getState()
    .createAsset(file, undefined, undefined, undefined, "file");

  return {
    assetId: asset.id,
    url: getAssetUrl(asset) ?? `asset://${asset.id}.png`,
    width: doc.canvas.width,
    height: doc.canvas.height,
    layerId: null,
    layerName: null
  };
}

/** Best-effort delete of a temporary render asset. Never throws. */
export async function deleteRenderedAsset(assetId: string): Promise<void> {
  try {
    await useAssetStore.getState().delete(assetId);
  } catch {
    // Ignore — cleanup is best-effort.
  }
}
