import { Asset } from "../../stores/ApiTypes";
import { SPACING, getSpacingPx } from "../../components/ui_primitives";

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

  // Rendered off-screen so it can be handed to setDragImage.
  container.style.cssText = `
    position: absolute;
    top: -9999px;
    left: -9999px;
    width: 240px;
    z-index: 9999;
    font-family: Inter, sans-serif;
    pointer-events: none;
  `;

  const stackAssets: (Asset | null)[] = [primaryAsset];

  if (otherAssets.length > 0) {
    const others = otherAssets
      .filter((a) => a.id !== primaryAsset.id)
      .slice(0, 2);
    stackAssets.push(...others);
  }

  // Pad with nulls so the stack visually represents the count (max 3 cards).
  while (stackAssets.length < Math.min(totalCount, 3)) {
    stackAssets.push(null);
  }

  stackAssets.forEach((asset, index) => {
    const item = document.createElement("div");
    const offset = index * 4;
    const scale = 1 - index * 0.04;

    item.style.cssText = `
      position: absolute;
      top: ${offset}px;
      left: ${offset}px;
      width: 100%;
      height: 64px;
      background: var(--palette-background-paper);
      border: 1px solid var(--palette-divider);
      border-radius: 8px;
      display: flex;
      align-items: center;
      padding: ${getSpacingPx(SPACING.md)};
      box-sizing: border-box;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25);
      z-index: ${getZIndex(index, stackAssets.length)};
      transform: scale(${scale});
      transform-origin: top left;
    `;

    if (asset) {
      const isImage = asset.content_type?.startsWith("image/") && asset.get_url;

      if (isImage && asset.get_url) {
        const img = document.createElement("img");
        img.src = asset.get_url;
        img.style.cssText = `
          width: 48px;
          height: 48px;
          object-fit: cover;
          border-radius: 4px;
          margin-right: ${getSpacingPx(SPACING.lg)};
          flex-shrink: 0;
          background-color: var(--palette-background-default);
        `;
        item.appendChild(img);
      } else {
        const iconDiv = document.createElement("div");
        iconDiv.style.cssText = `
          width: 48px;
          height: 48px;
          border-radius: 4px;
          margin-right: ${getSpacingPx(SPACING.lg)};
          flex-shrink: 0;
          background-color: var(--palette-grey-800);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--palette-text-secondary);
          font-weight: 600;
          font-size: var(--fontSizeSmaller);
          text-transform: uppercase;
        `;
        const ext = asset.name.split(".").pop()?.substring(0, 4) || "FILE";
        iconDiv.textContent = ext;
        item.appendChild(iconDiv);
      }

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
        color: var(--palette-text-primary);
        font-size: var(--fontSizeSmall);
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-bottom: ${getSpacingPx(SPACING.micro)};
      `;
      infoDiv.appendChild(name);

      const details = document.createElement("div");
      details.textContent = asset.content_type || "Unknown type";
      details.style.cssText = `
        color: var(--palette-text-secondary);
        font-size: var(--fontSizeSmaller);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      `;
      infoDiv.appendChild(details);

      item.appendChild(infoDiv);
    } else {
      item.style.background = "var(--palette-background-default)";
    }

    container.appendChild(item);
  });

  if (totalCount > 1) {
    const badge = document.createElement("div");
    badge.textContent = String(totalCount);
    badge.style.cssText = `
      position: absolute;
      top: -8px;
      right: -8px;
      background-color: var(--palette-primary-main);
      color: var(--palette-primary-contrastText);
      border-radius: 12px;
      padding: ${getSpacingPx(SPACING.micro)} ${getSpacingPx(SPACING.md)};
      min-width: 20px;
      text-align: center;
      font-size: var(--fontSizeSmall);
      font-weight: bold;
      border: 2px solid var(--palette-background-paper);
      z-index: 1000;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    `;
    container.appendChild(badge);
  }

  return container;
}
