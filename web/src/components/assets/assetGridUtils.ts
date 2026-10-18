import { Asset } from "../../stores/ApiTypes";
import { TYPE_FILTERS, TypeFilterKey } from "../../utils/formatUtils";

/** A type group in the asset grid: every type filter except "All". */
export type AssetGroupKey = Exclude<TypeFilterKey, "all">;

/** Group order in the grid and the type filter, matching the filter menu. */
export const ASSET_GROUP_KEYS: AssetGroupKey[] = TYPE_FILTERS.map(
  (filter) => filter.key
).filter((key): key is AssetGroupKey => key !== "all");

export type AssetOrDivider =
  | { isDivider: true; type: string; count: number }
  | (Asset & { isDivider: false; type: string });

export function isAssetItem(
  item: AssetOrDivider
): item is Asset & { isDivider: false; type: string } {
  return !item.isDivider;
}

export const DIVIDER_HEIGHT = 30;

export const calculateGridDimensions = (
  width: number,
  assetItemSize: number,
  itemSpacing: number
) => {
  const baseSize = 42; // multiplier for the asset size slider value
  const minItemSize = baseSize * assetItemSize;
  const maxItemSize = minItemSize * 1.1;
  const maxColumns = 100;

  let columns = Math.min(
    maxColumns,
    Math.max(1, Math.floor((width + itemSpacing) / (minItemSize + itemSpacing)))
  );

  let itemWidth = Math.min(
    Math.floor((width - itemSpacing * (columns + 1)) / columns),
    maxItemSize
  );

  // If items are at max size and there's still room, add more columns up to maxColumns
  while (
    itemWidth === maxItemSize &&
    columns < maxColumns &&
    columns < Math.floor((width + itemSpacing) / (maxItemSize + itemSpacing))
  ) {
    columns++;
    itemWidth = Math.min(
      Math.floor((width - itemSpacing * (columns + 1)) / columns),
      maxItemSize
    );
  }

  const itemHeight = itemWidth; // 1:1 aspect ratio

  return { columns, itemWidth, itemHeight };
};

/**
 * Lay the assets out as type groups, each led by a divider row. Assets of a
 * collapsed group are left out, so only its divider remains. With `grouped`
 * false (one type is filtered in) the assets come back without dividers.
 */
export const prepareItems = (
  assets: Asset[],
  collapsedGroups: ReadonlySet<string>,
  grouped = true
): AssetOrDivider[] => {
  if (!assets || assets.length === 0) {
    return [];
  }

  const assetsByGroup = new Map<AssetGroupKey, Asset[]>(
    ASSET_GROUP_KEYS.map((key) => [key, []])
  );
  assets.forEach((asset) => {
    assetsByGroup.get(getAssetGroup(asset.content_type))?.push(asset);
  });

  return [...assetsByGroup.entries()].flatMap(
    ([type, groupAssets]): AssetOrDivider[] => {
      if (groupAssets.length === 0) {
        return [];
      }
      const items = groupAssets.map(
        (asset): AssetOrDivider => ({ ...asset, isDivider: false, type })
      );
      if (!grouped) {
        return items;
      }
      return [
        { isDivider: true, type, count: groupAssets.length },
        ...(collapsedGroups.has(type) ? [] : items)
      ];
    }
  );
};

/** Count the assets in each type group. */
export const countAssetGroups = (
  assets: Asset[]
): Record<AssetGroupKey, number> => {
  const counts = Object.fromEntries(
    ASSET_GROUP_KEYS.map((key) => [key, 0])
  ) as Record<AssetGroupKey, number>;
  assets.forEach((asset) => {
    counts[getAssetGroup(asset.content_type)] += 1;
  });
  return counts;
};

export const getAssetCategory = (contentType: string): string => {
  const normalized = contentType.toLowerCase().split(";")[0].trim();
  const topLevelType = normalized.split("/")[0] || "other";

  if (topLevelType === "model") {
    return "model_3d";
  }

  return topLevelType || "other";
};

/**
 * The type group an asset belongs to. Top-level MIME types without a group of
 * their own (fonts, unknown types) fall into "other", so the "Other" filter
 * and the "Other" group hold the same assets.
 */
export const getAssetGroup = (contentType: string): AssetGroupKey => {
  const category = getAssetCategory(contentType || "");
  return (ASSET_GROUP_KEYS as string[]).includes(category)
    ? (category as AssetGroupKey)
    : "other";
};

export const calculateRowCount = (
  preparedItems: AssetOrDivider[],
  columns: number
): number => {
  let count = 0;
  let currentRowItemCount = 0;
  preparedItems.forEach((item) => {
    if (item.isDivider) {
      if (currentRowItemCount > 0) {
        count++;
      }
      count++;
      currentRowItemCount = 0;
    } else {
      currentRowItemCount++;
      if (currentRowItemCount === columns) {
        count++;
        currentRowItemCount = 0;
      }
    }
  });
  if (currentRowItemCount > 0) {
    count++;
  }
  return count;
};

export const getItemsForRow = (
  preparedItems: AssetOrDivider[],
  rowIndex: number,
  columns: number
): AssetOrDivider[] => {
  let currentRow = 0;
  let itemsInCurrentRow = 0;
  let startIndex = 0;

  for (let i = 0; i < preparedItems.length; i++) {
    const item = preparedItems[i];
    if (item.isDivider) {
      if (itemsInCurrentRow > 0) {
        if (currentRow === rowIndex) {
          return preparedItems.slice(startIndex, i);
        }
        currentRow++;
        itemsInCurrentRow = 0;
      }
      if (currentRow === rowIndex) {
        return [item];
      }
      currentRow++;
      startIndex = i + 1;
    } else {
      itemsInCurrentRow++;
      if (itemsInCurrentRow === columns || i === preparedItems.length - 1) {
        if (currentRow === rowIndex) {
          return preparedItems.slice(startIndex, i + 1);
        }
        currentRow++;
        itemsInCurrentRow = 0;
        startIndex = i + 1;
      }
    }
  }

  // Return the last row even if it's not complete
  if (currentRow === rowIndex && itemsInCurrentRow > 0) {
    return preparedItems.slice(startIndex);
  }

  return [];
};
