import { Asset } from "../../stores/ApiTypes";

// Helper to get z-index for stack
const getZIndex = (index: number, total: number) => total - index;

/**
 * Creates a custom drag image element for assets
 *
 * @param primaryAsset The asset currently being dragged (under cursor)
 * @param totalCount Total number of assets being dragged
 * @param otherAssets Optional list of other selected assets to show in stack
 */
export function createAssetDragImage(
  primaryAsset: Asset,
  totalCount: number = 1,
  otherAssets: Asset[] = []
): HTMLElement {
  const container = document.createElement("div");

  // Base container style - needs to be off-screen usually
  container.style.cssText = `
    position: absolute;
    top: -9999px;
    left: -9999px;
    width: 240px;
    z-index: 9999;
    font-family: Inter, sans-serif;
    pointer-events: none;
  `;

  // Determine items to show in stack
  // Always show primary asset first
  const stackAssets: (Asset | null)[] = [primaryAsset];

  // Add other assets if available, up to 2 more
  if (otherAssets.length > 0) {
    // Filter out the primary asset if it's in the list
    const others = otherAssets
      .filter((a) => a.id !== primaryAsset.id)
      .slice(0, 2);
    stackAssets.push(...others);
  }

  // Fill with nulls if we need more items to represent the count (visual stack effect), max 3 total
  while (stackAssets.length < Math.min(totalCount, 3)) {
    stackAssets.push(null);
  }

  // Render stack
  stackAssets.forEach((asset, index) => {
    const item = document.createElement("div");
    // Offset each card slightly down and right
    const offset = index * 4;
    const scale = 1 - index * 0.04;

    item.style.cssText = `
      position: absolute;
      top: ${offset}px;
      left: ${offset}px;
      width: 100%;
      height: 64px;
      background: #1e1e1e;
      border: 1px solid #333;
      border-radius: 8px;
      display: flex;
      align-items: center;
      padding: 8px;
      box-sizing: border-box;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      z-index: ${getZIndex(index, stackAssets.length)};
      transform: scale(${scale});
      transform-origin: top left;
    `;

    // Content for this card
    if (asset) {
      // Icon/Thumbnail
      const isImage = asset.content_type?.startsWith("image/") && asset.get_url;

      if (isImage && asset.get_url) {
        const img = document.createElement("img");
        img.src = asset.get_url;
        img.style.cssText = `
          width: 48px;
          height: 48px;
          object-fit: cover;
          border-radius: 4px;
          margin-right: 12px;
          flex-shrink: 0;
          background-color: #000;
        `;
        item.appendChild(img);
      } else {
        // Generic File Icon
        const iconDiv = document.createElement("div");
        iconDiv.style.cssText = `
          width: 48px;
          height: 48px;
          border-radius: 4px;
          margin-right: 12px;
          flex-shrink: 0;
          background-color: #333;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #aaa;
          font-weight: 600;
          font-size: 11px;
          text-transform: uppercase;
        `;
        // Extension
        const ext = asset.name.split(".").pop()?.substring(0, 4) || "FILE";
        iconDiv.textContent = ext;
        item.appendChild(iconDiv);
      }

      // Info
      const infoDiv = document.createElement("div");
      infoDiv.style.cssText = `
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        justify-content: center;
      `;

      const name = document.createElement("div");
      name.textContent = asset.name;
      name.style.cssText = `
        color: #eee;
        font-size: 13px;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-bottom: 2px;
      `;
      infoDiv.appendChild(name);

      const details = document.createElement("div");
      details.textContent = asset.content_type || "Unknown type";
      details.style.cssText = `
        color: #888;
        font-size: 11px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      `;
      infoDiv.appendChild(details);

      item.appendChild(infoDiv);
    } else {
      // Placeholder card (looks like back of a card or generic)
      item.style.background = "#252525";
    }

    container.appendChild(item);
  });

  // Badge if more than 1
  if (totalCount > 1) {
    const badge = document.createElement("div");
    badge.textContent = String(totalCount);
    badge.style.cssText = `
      position: absolute;
      top: -8px;
      right: -8px;
      background-color: #3b82f6;
      color: white;
      border-radius: 12px;
      padding: 2px 8px;
      min-width: 20px;
      text-align: center;
      font-size: 12px;
      font-weight: bold;
      border: 2px solid #1f2937;
      z-index: 1000;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    `;
    container.appendChild(badge);
  }

  return container;
}
