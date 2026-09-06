/**
 * Reading an entity off its asset row.
 *
 * An entity is an ordinary image asset carrying a marker under
 * `metadata.nodetool_entity`. Two callers need the same reader — the agent's
 * `entities` capability and the websocket host that serves `getEntity` /
 * `listEntities` to a running graph — and an asset that reads as an entity in
 * one and not the other is the library disagreeing with itself. This is the
 * one reader.
 */

import { readEntityMarker, type Entity } from "@nodetool-ai/protocol";

import type { Asset } from "./asset.js";
import { LOOSE_PROJECT_ID } from "./project.js";

/**
 * Content type → file extension for the `asset://<id>.<ext>` reference image
 * URI. Entities are image assets, but the table keeps the non-image rows the
 * agent's own copy carries so a mistagged asset resolves the same either way.
 */
const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/bmp": "bmp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/flac": "flac",
  "audio/ogg": "ogg",
  "application/octet-stream": "bin"
};

/**
 * Read the entity marker off an asset, or null when it carries none. Mirrors
 * `assetToEntity` in the web library: the asset's own bytes are the entity's
 * primary reference image unless the marker names a swapped one, the marker
 * holds everything else, and the asset row says which project it belongs to.
 */
export function entityFromAsset(
  asset: Pick<Asset, "id" | "content_type" | "metadata" | "created_at"> & {
    /** Absent on a row read before the column existed — the loose bucket. */
    project_id?: string;
  }
): Entity | null {
  const marker = readEntityMarker(asset.metadata);
  if (!marker) return null;

  const { reference_asset_id: swapped, ...fields } = marker;
  const ext = MIME_TO_EXT[asset.content_type] ?? "png";
  // A swapped picture is another asset, whose content type is not in hand
  // here — `asset://<id>` with no extension is what the web library writes
  // too, and resolves through the extension-tolerant asset lookup.
  const referenceImage =
    swapped && swapped !== asset.id
      ? { type: "image" as const, asset_id: swapped, uri: `asset://${swapped}` }
      : {
          type: "image" as const,
          asset_id: asset.id,
          uri: `asset://${asset.id}.${ext}`
        };
  const entity: Entity = {
    ...fields,
    type: "entity",
    id: asset.id,
    project_id: asset.project_id || LOOSE_PROJECT_ID,
    reference_images: [referenceImage]
  };
  if (asset.created_at) {
    entity.created_at = asset.created_at;
  }
  return entity;
}
