/**
 * Bridge between the app's drag-and-drop payloads and the Prompt composer.
 *
 * Assets dragged from the asset browser / search arrive either as a single
 * full `Asset` (`type: "asset"`) or as a list of ids (`type: "assets-multiple"`).
 * The composer turns each into an asset-mention chip (`asset://<id>.<ext>`).
 */
import type { Asset } from "../../../../stores/ApiTypes";
import {
  DRAG_DATA_MIME,
  deserializeDragData
} from "../../../../lib/dragdrop/serialization";

export interface AssetDrag {
  /** Fully-resolved assets (single-asset drags carry the whole object). */
  assets: Asset[];
  /** Asset ids that still need resolving (multi-select drags carry ids only). */
  pendingIds: string[];
}

/** Cheap check usable during `dragover`, where payload contents are hidden. */
export const hasAssetDrag = (dataTransfer: DataTransfer | null): boolean =>
  !!dataTransfer &&
  (dataTransfer.types.includes(DRAG_DATA_MIME) ||
    dataTransfer.types.includes("asset") ||
    dataTransfer.types.includes("selectedAssetIds"));

/** Read a drop's asset payload, or `null` when it isn't an asset drag. */
export const readAssetDrag = (
  dataTransfer: DataTransfer | null
): AssetDrag | null => {
  if (!dataTransfer) {
    return null;
  }
  const data = deserializeDragData(dataTransfer);
  if (!data) {
    return null;
  }
  if (data.type === "asset") {
    return { assets: [data.payload as Asset], pendingIds: [] };
  }
  if (data.type === "assets-multiple") {
    return { assets: [], pendingIds: data.payload as string[] };
  }
  return null;
};
