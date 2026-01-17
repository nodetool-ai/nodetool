/**
 * Drag & Drop Serialization Utilities
 *
 * Handles serialization and deserialization of drag data with backward
 * compatibility for existing dataTransfer keys.
 */

import type { DragData, DragDataType } from "./types";

/** Custom MIME type for internal drag data */
export const DRAG_DATA_MIME = "application/x-nodetool-drag";

/** Legacy key mapping for backward compatibility */
const LEGACY_KEY_MAP: Record<DragDataType, string> = {
  "create-node": "create-node",
  asset: "asset",
  "assets-multiple": "selectedAssetIds",
  file: "", // External files don't use custom keys
  tab: "text/plain",
  "collection-file": "",
  pattern: "" // Pattern uses unified format only
};

/**
 * Serialize drag data with backward compatibility
 *
 * Sets both the new unified format and legacy format keys to ensure
 * compatibility with components that haven't been migrated yet.
 */
export function serializeDragData<T extends DragDataType>(
  data: DragData<T>,
  dataTransfer: DataTransfer
): void {
  // Set new unified format
  const serialized = JSON.stringify(data);
  dataTransfer.setData(DRAG_DATA_MIME, serialized);

  // Also set legacy format for backward compatibility
  const legacyKey = LEGACY_KEY_MAP[data.type];
  if (legacyKey) {
    dataTransfer.setData(legacyKey, JSON.stringify(data.payload));
  }
}

/**
 * Deserialize drag data with fallback to legacy formats
 *
 * Tries the new unified format first, then falls back to legacy keys
 * if the unified format is not present.
 */
export function deserializeDragData(dataTransfer: DataTransfer): DragData | null {
  // Try new unified format first
  const unified = dataTransfer.getData(DRAG_DATA_MIME);
  if (unified) {
    try {
      return JSON.parse(unified) as DragData;
    } catch {
      // Failed to parse unified format, fall through to legacy
    }
  }

  // Fall back to legacy formats
  const createNode = dataTransfer.getData("create-node");
  if (createNode) {
    try {
      return {
        type: "create-node",
        payload: JSON.parse(createNode)
      };
    } catch {
      // Ignore parse errors
    }
  }

  const selectedAssetIds = dataTransfer.getData("selectedAssetIds");
  if (selectedAssetIds) {
    try {
      const ids = JSON.parse(selectedAssetIds) as string[];
      return {
        type: "assets-multiple",
        payload: ids,
        metadata: { count: ids.length }
      };
    } catch {
      // Ignore parse errors
    }
  }

  const asset = dataTransfer.getData("asset");
  if (asset) {
    try {
      return {
        type: "asset",
        payload: JSON.parse(asset)
      };
    } catch {
      // Ignore parse errors
    }
  }

  // Check for external files (will be handled separately in drop zone)
  if (hasExternalFiles(dataTransfer)) {
    return null;
  }

  return null;
}

/**
 * Check if dataTransfer contains external files
 */
export function hasExternalFiles(dataTransfer: DataTransfer): boolean {
  // Check items for file kind
  if (dataTransfer.items) {
    return Array.from(dataTransfer.items).some((item) => item.kind === "file");
  }
  // Fallback to files property
  return dataTransfer.files.length > 0;
}

/**
 * Extract files from dataTransfer
 */
export function extractFiles(dataTransfer: DataTransfer): File[] {
  return Array.from(dataTransfer.files);
}

/**
 * Create a count badge drag image element
 *
 * Creates a styled badge element showing a count, useful for
 * showing the number of selected items during drag.
 */
export function createDragCountBadge(count: number): HTMLElement {
  const dragImage = document.createElement("div");
  dragImage.textContent = count.toString();
  dragImage.style.cssText = `
    position: absolute;
    top: -99999px;
    background-color: #222;
    color: #999;
    border: 3px solid #333;
    border-radius: 4px;
    height: 40px;
    width: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    font-weight: bold;
  `;
  return dragImage;
}
