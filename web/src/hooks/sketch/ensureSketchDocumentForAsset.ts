import { trpcClient } from "../../trpc/client";
import { BASE_URL } from "../../stores/BASE_URL";
import type { Asset } from "../../stores/ApiTypes";
import type { AssetUpdate } from "../../stores/AssetStore";
import { buildSeededImageDocument } from "./buildSeededImageDocument";
import { newDocumentId } from "../../lib/newDocumentId";

/** Sketch documents are scoped to a project; assets aren't, so use the default. */
const SKETCH_PROJECT_ID = "default";

/** The sketch document this image asset is already backed by, if any. */
export function readSketchDocumentId(asset: Asset): string | null {
  const id = asset.sketch_document_id;
  return id != null && id.length > 0 ? id : null;
}

/** Common image content types → file extension for building storage keys. */
const IMAGE_MIME_EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/bmp": "bmp",
  "image/svg+xml": "svg"
};

/** Best-effort file extension for an asset, from its name or content type. */
function assetExtension(asset: Asset): string | null {
  const name = (asset.name ?? "").split(/[?#]/)[0];
  const dot = name.lastIndexOf(".");
  if (dot > 0 && dot < name.length - 1) {
    return name.slice(dot + 1).toLowerCase();
  }
  const contentType = asset.content_type?.toLowerCase();
  return (contentType && IMAGE_MIME_EXTENSION[contentType]) || null;
}

/**
 * Resolve an asset to a fetchable image URL for measuring its dimensions. The
 * storage route serves files by name, so the fallback key needs an extension —
 * a bare `/api/storage/<id>` (no extension) 404s. Derive one from the asset's
 * name or content type the same way `assetLayerUri` lifts the key from a URL.
 */
function assetImageUrl(asset: Asset): string {
  const direct = asset.get_url ?? asset.thumb_url;
  if (direct && /^(https?:|data:|blob:)/.test(direct)) return direct;
  if (direct?.startsWith("/")) return `${BASE_URL}${direct}`;
  const ext = assetExtension(asset);
  const key = ext ? `${asset.id}.${ext}` : asset.id;
  return `${BASE_URL}/api/storage/${key}`;
}

/**
 * Stable `asset://{id}.{ext}` reference for the seeded base layer. The storage
 * endpoint serves files by name, so the extension is required (a bare
 * `asset://{id}` resolves to `/api/storage/{id}` and 404s). The authoritative
 * filename lives in the asset's `get_url` (server-built `{id}.{ext}`); we lift
 * just the storage key from it so the persisted reference never embeds a signed,
 * expiring URL. Falls back to the bare id when no URL is available.
 */
function assetLayerUri(asset: Asset): string {
  const url = asset.get_url ?? asset.thumb_url ?? "";
  const path = url.split("?")[0].split("#")[0];
  const marker = "/api/storage/";
  const markerIndex = path.indexOf(marker);
  const key =
    markerIndex >= 0
      ? path.slice(markerIndex + marker.length)
      : path.split("/").pop() || asset.id;
  return `asset://${key}`;
}

interface ImageInfo {
  width: number;
  height: number;
  /** Ink that shows on the image: black on a light image, white on a dark one. */
  ink?: string;
}

function loadImageInfo(url: string): Promise<ImageInfo> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () =>
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight,
        ink: contrastingInk(img)
      });
    img.onerror = () =>
      reject(new Error(`Failed to load image for measurement: ${url}`));
    img.src = url;
  });
}

/**
 * Black or white, whichever shows on the image's average color. A white
 * "New sketch" once opened with white ink, so first strokes were invisible.
 * Undefined when the pixels cannot be read, which keeps the default ink.
 */
export function contrastingInk(img: CanvasImageSource): string | undefined {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return undefined;
    }
    ctx.drawImage(img, 0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    if (a === 0) {
      return undefined;
    }
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    return luma > 127 ? "#000000" : "#ffffff";
  } catch {
    // A cross-origin image taints the canvas. Keep the default ink.
    return undefined;
  }
}

/** First-use creations still in flight, by asset id. */
const pendingCreations = new Map<string, Promise<string>>();

/**
 * Return the sketch document that backs an image asset, creating one on first
 * use. A new document is sized to the image and seeded with it as the base
 * layer; the two are linked bidirectionally (asset → sketch via
 * `sketch_document_id`, sketch → asset via `thumbnailAssetId`) so the document
 * can later be reopened and saving renders back into this asset.
 */
export function ensureSketchDocumentForAsset(
  asset: Asset,
  updateAsset: (update: AssetUpdate) => Promise<Asset>
): Promise<string> {
  const existing = readSketchDocumentId(asset);
  if (existing) return Promise.resolve(existing);
  // A second call while the first is still creating joins it. The editor's
  // effect runs twice on mount under StrictMode, and each run made its own
  // document, so one "New sketch" listed two "Untitled.png" documents.
  const pending = pendingCreations.get(asset.id);
  if (pending) return pending;
  const creation = createSketchDocumentForAsset(asset, updateAsset).finally(
    () => pendingCreations.delete(asset.id)
  );
  pendingCreations.set(asset.id, creation);
  return creation;
}

async function createSketchDocumentForAsset(
  asset: Asset,
  updateAsset: (update: AssetUpdate) => Promise<Asset>
): Promise<string> {
  const { width, height, ink } = await loadImageInfo(assetImageUrl(asset));

  const created = await trpcClient.sketch.create.mutate({
    id: newDocumentId(),
    name: asset.name || "Untitled",
    projectId: SKETCH_PROJECT_ID,
    width,
    height
  });

  const document = buildSeededImageDocument(created.document, {
    imageUri: assetLayerUri(asset),
    width,
    height,
    name: asset.name || "Image",
    ink
  });

  await trpcClient.sketch.update.mutate({
    id: created.id,
    document,
    thumbnailAssetId: asset.id
  });

  await updateAsset({
    id: asset.id,
    sketch_document_id: created.id
  });

  return created.id;
}
