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

/** Best-effort delete of a temporary render asset. Never throws. */
export async function deleteRenderedAsset(assetId: string): Promise<void> {
  try {
    await useAssetStore.getState().delete(assetId);
  } catch {
    // Ignore — cleanup is best-effort.
  }
}
