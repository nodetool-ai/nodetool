/**
 * Drag & Drop Serialization Utilities
 *
 * Handles serialization and deserialization of drag data with backward
 * compatibility for existing dataTransfer keys.
 */

import type { Asset, NodeMetadata } from "../../stores/ApiTypes";
import type { DragData, DragDataType } from "./types";

/** Custom MIME type for internal drag data */
export const DRAG_DATA_MIME = "application/x-nodetool-drag";

const VALID_DRAG_TYPES: ReadonlySet<string> = new Set<DragDataType>([
  "create-node",
  "asset",
  "assets-multiple",
  "sketch",
  "timeline",
  "file",
  "tab",
  "collection-file",
  "chat-media"
]);

function isDragData(value: unknown): value is DragData {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string" &&
    VALID_DRAG_TYPES.has(value.type)
  );
}

function isNodeMetadataLike(value: unknown): value is NodeMetadata {
  return (
    typeof value === "object" &&
    value !== null &&
    "node_type" in value &&
    typeof (value as NodeMetadata).node_type === "string"
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item): item is string => typeof item === "string");
}

function isAssetLike(value: unknown): value is Asset {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof (value as { id: unknown }).id === "string"
  );
}

function isRecordWithId(value: unknown): value is { id: string; name: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof (value as { id: string }).id === "string"
  );
}

/** Legacy key mapping for backward compatibility */
const LEGACY_KEY_MAP: Record<DragDataType, string> = {
  "create-node": "create-node",
  asset: "asset",
  "assets-multiple": "selectedAssetIds",
  sketch: "sketch",
  timeline: "timeline",
  file: "", // External files don't use custom keys
  tab: "text/plain",
  "collection-file": "",
  "chat-media": "" // Only carried in the unified format
};

/**
 * Serialize drag data, setting both the unified MIME format and the legacy
 * dataTransfer key so unmigrated components still read the drag.
 */
export function serializeDragData<T extends DragDataType>(
  data: DragData<T>,
  dataTransfer: DataTransfer
): void {
  const serialized = JSON.stringify(data);
  dataTransfer.setData(DRAG_DATA_MIME, serialized);

  const legacyKey = LEGACY_KEY_MAP[data.type];
  if (legacyKey) {
    dataTransfer.setData(legacyKey, JSON.stringify(data.payload));
  }
}

/**
 * Deserialize drag data, trying the unified MIME format first and falling
 * back to legacy dataTransfer keys.
 */
export function deserializeDragData(dataTransfer: DataTransfer): DragData | null {
  const unified = dataTransfer.getData(DRAG_DATA_MIME);
  if (unified) {
    try {
      const parsed: unknown = JSON.parse(unified);
      if (isDragData(parsed)) return parsed;
    } catch {
      // Failed to parse unified format, fall through to legacy
    }
  }

  const createNode = dataTransfer.getData("create-node");
  if (createNode) {
    try {
      const payload: unknown = JSON.parse(createNode);
      if (isNodeMetadataLike(payload)) {
        return { type: "create-node", payload };
      }
    } catch {
      // Ignore parse errors
    }
  }

  const selectedAssetIds = dataTransfer.getData("selectedAssetIds");
  if (selectedAssetIds) {
    try {
      const ids: unknown = JSON.parse(selectedAssetIds);
      if (isStringArray(ids)) {
        return {
          type: "assets-multiple",
          payload: ids,
          metadata: { count: ids.length }
        };
      }
    } catch {
      // Ignore parse errors
    }
  }

  const asset = dataTransfer.getData("asset");
  if (asset) {
    try {
      const assetPayload: unknown = JSON.parse(asset);
      if (isAssetLike(assetPayload)) {
        return { type: "asset", payload: assetPayload };
      }
    } catch {
      // Ignore parse errors
    }
  }

  const sketch = dataTransfer.getData("sketch");
  if (sketch) {
    try {
      const sketchPayload: unknown = JSON.parse(sketch);
      if (isRecordWithId(sketchPayload)) {
        return {
          type: "sketch",
          payload: sketchPayload as DragData<"sketch">["payload"]
        };
      }
    } catch {
      // Ignore parse errors
    }
  }

  const timeline = dataTransfer.getData("timeline");
  if (timeline) {
    try {
      const timelinePayload: unknown = JSON.parse(timeline);
      if (isRecordWithId(timelinePayload)) {
        return {
          type: "timeline",
          payload: timelinePayload as DragData<"timeline">["payload"]
        };
      }
    } catch {
      // Ignore parse errors
    }
  }

  return null;
}

/**
 * Resolve the full Asset objects for an "assets-multiple" drag.
 *
 * Prefers the assets captured on `dragData.metadata.assets` at drag-start
 * time, since the AssetGridStore instance that produced the drag (a scoped
 * sidebar panel) may not be the store instance the drop target reads from.
 * Falls back to looking the ids up in `fallbackAssets` (e.g. a singleton
 * store's cached assets) for drags that predate the metadata field.
 */
export function resolveAssetsMultiple(
  ids: string[],
  metadataAssets: Asset[] | undefined,
  fallbackAssets: Asset[]
): Asset[] {
  const idOrder = new Map(ids.map((id, index) => [id, index]));
  const byId = new Map<string, Asset>();

  for (const asset of metadataAssets ?? []) {
    if (idOrder.has(asset.id)) byId.set(asset.id, asset);
  }
  if (byId.size < idOrder.size) {
    for (const asset of fallbackAssets) {
      if (idOrder.has(asset.id) && !byId.has(asset.id)) {
        byId.set(asset.id, asset);
      }
    }
  }

  return ids
    .map((id) => byId.get(id))
    .filter((asset): asset is Asset => asset !== undefined);
}

export function hasExternalFiles(dataTransfer: DataTransfer): boolean {
  if (dataTransfer.items) {
    return Array.from(dataTransfer.items).some((item) => item.kind === "file");
  }
  return dataTransfer.files.length > 0;
}

export function extractFiles(dataTransfer: DataTransfer): File[] {
  return Array.from(dataTransfer.files);
}

/** Build an off-screen badge element showing `count`, for use as a drag image. */
export function createDragCountBadge(count: number): HTMLElement {
  const dragImage = document.createElement("div");
  dragImage.textContent = count.toString();
  dragImage.style.cssText = `
    position: absolute;
    top: -99999px;
    background-color: var(--palette-background-paper);
    color: var(--palette-grey-300);
    border: 3px solid var(--palette-grey-800);
    border-radius: 4px;
    height: 40px;
    width: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--fontSizeBig);
    font-weight: bold;
  `;
  return dragImage;
}
