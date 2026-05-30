import { trpcClient } from "../../trpc/client";
import { BASE_URL } from "../../stores/BASE_URL";
import type { Asset } from "../../stores/ApiTypes";
import type { AssetUpdate } from "../../stores/AssetStore";
import { buildSeededImageDocument } from "./buildSeededImageDocument";

/** Metadata key under which an image asset records the sketch that backs it. */
export const SKETCH_DOCUMENT_METADATA_KEY = "sketchDocumentId";

/** Sketch documents are scoped to a project; assets aren't, so use the default. */
const SKETCH_PROJECT_ID = "default";

/** The sketch document this image asset is already backed by, if any. */
export function readSketchDocumentId(asset: Asset): string | null {
  const id = asset.metadata?.[SKETCH_DOCUMENT_METADATA_KEY];
  return typeof id === "string" && id.length > 0 ? id : null;
}

/** Resolve an asset to a fetchable image URL for measuring its dimensions. */
function assetImageUrl(asset: Asset): string {
  const direct = asset.get_url ?? asset.thumb_url;
  if (direct && /^(https?:|data:|blob:)/.test(direct)) return direct;
  if (direct?.startsWith("/")) return `${BASE_URL}${direct}`;
  return `${BASE_URL}/api/storage/${asset.id}`;
}

function loadImageSize(
  url: string
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = url;
  });
}

/**
 * Return the sketch document that backs an image asset, creating one on first
 * use. A new document is sized to the image and seeded with it as the base
 * layer; the two are linked bidirectionally (asset → sketch via metadata,
 * sketch → asset via `thumbnailAssetId`) so the document can later be reopened
 * and saving renders back into this asset.
 */
export async function ensureSketchDocumentForAsset(
  asset: Asset,
  updateAsset: (update: AssetUpdate) => Promise<Asset>
): Promise<string> {
  const existing = readSketchDocumentId(asset);
  if (existing) return existing;

  const { width, height } = await loadImageSize(assetImageUrl(asset));

  const created = await trpcClient.sketch.create.mutate({
    name: asset.name || "Untitled",
    projectId: SKETCH_PROJECT_ID,
    width,
    height
  });

  const document = buildSeededImageDocument(created.document, {
    assetId: asset.id,
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
    metadata: {
      ...(asset.metadata ?? {}),
      [SKETCH_DOCUMENT_METADATA_KEY]: created.id
    }
  });

  return created.id;
}
