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
  "output-image": "output-image"
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

  // Check for output-image type
  const outputImage = dataTransfer.getData("output-image");
  if (outputImage) {
    try {
      return {
        type: "output-image",
        payload: JSON.parse(outputImage)
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

/**
 * Default maximum size for drag preview images
 */
const DEFAULT_PREVIEW_MAX_SIZE = 120;

/**
 * Create an image preview drag element
 *
 * Creates a styled container with an image thumbnail for drag preview.
 * Supports optional count badge for multiple items.
 *
 * @param thumbnailUrl - URL of the image to display as preview
 * @param count - Optional count badge to show (for multiple items)
 * @param maxSize - Maximum width/height in pixels (default: 120)
 * @returns HTMLElement to use as drag image
 */
export function createDragImagePreview(
  thumbnailUrl: string,
  count?: number,
  maxSize: number = DEFAULT_PREVIEW_MAX_SIZE
): HTMLElement {
  const container = document.createElement("div");
  container.className = "drag-preview-container";
  container.style.cssText = `
    position: absolute;
    top: -99999px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background-color: rgba(34, 34, 34, 0.95);
    border: 2px solid rgba(100, 100, 100, 0.8);
    border-radius: 8px;
    padding: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  `;

  // Create the image element
  const img = document.createElement("img");
  img.src = thumbnailUrl;
  img.style.cssText = `
    max-width: ${maxSize}px;
    max-height: ${maxSize}px;
    width: auto;
    height: auto;
    border-radius: 4px;
    object-fit: contain;
  `;
  img.alt = "Drag preview";
  container.appendChild(img);

  // Add count badge if multiple items
  if (count !== undefined && count > 1) {
    const badge = document.createElement("div");
    badge.textContent = count.toString();
    badge.style.cssText = `
      position: absolute;
      top: -8px;
      right: -8px;
      background-color: var(--palette-primary-main, #6366f1);
      color: white;
      border-radius: 50%;
      min-width: 22px;
      height: 22px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: bold;
      padding: 0 4px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
    `;
    container.appendChild(badge);
  }

  return container;
}
