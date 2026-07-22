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
  return typeof id === "string" && id.length > 0 ? id : null;
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

function loadImageSize(
  url: string
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () =>
      reject(new Error(`Failed to load image for measurement: ${url}`));
    img.src = url;
  });
}

/**
 * Return the sketch document that backs an image asset, creating one on first
 * use. A new document is sized to the image and seeded with it as the base
 * layer; the two are linked bidirectionally (asset → sketch via
 * `sketch_document_id`, sketch → asset via `thumbnailAssetId`) so the document
 * can later be reopened and saving renders back into this asset.
 */
export async function ensureSketchDocumentForAsset(
  asset: Asset,
  updateAsset: (update: AssetUpdate) => Promise<Asset>
): Promise<string> {
  const existing = readSketchDocumentId(asset);
  if (existing) return existing;

  const { width, height } = await loadImageSize(assetImageUrl(asset));

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
    name: asset.name || "Image"
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
