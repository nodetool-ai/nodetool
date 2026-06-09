import { describe, it, expect } from "@jest/globals";
import {
  isAssetItem,
  getFooterHeight,
  getExtraFooterSpace,
  getAssetCategory,
  calculateGridDimensions,
  calculateRowCount,
  getItemsForRow,
  AssetOrDivider
} from "../assetGridUtils";
import { Asset } from "../../../stores/ApiTypes";

const createAsset = (overrides: Partial<Asset>): Asset => ({
  id: "asset-1",
  name: "asset",
  content_type: "image/png",
  size: 1024,
  created_at: "2024-01-01T00:00:00Z",
  parent_id: "",
  user_id: "user-1",
  get_url: "/assets/asset-1",
  thumb_url: "/assets/asset-1-thumb",
  workflow_id: null,
  metadata: {},
  ...overrides
});

const makeDivider = (type: string, count: number): AssetOrDivider => ({
  isDivider: true,
  type,
  count
});

const makeAssetItem = (
  asset: Asset,
  type: string
): Asset & { isDivider: false; type: string } => ({
  ...asset,
  isDivider: false,
  type
});

describe("isAssetItem", () => {
  it("returns true for a non-divider item", () => {
    const item = makeAssetItem(createAsset({}), "image");
    expect(isAssetItem(item)).toBe(true);
  });

  it("returns false for a divider item", () => {
    const item = makeDivider("image", 5);
    expect(isAssetItem(item)).toBe(false);
  });
});

describe("getFooterHeight", () => {
  it("returns 5 for size 1", () => {
    expect(getFooterHeight(1)).toBe(5);
  });

  it("returns 40 for size 2", () => {
    expect(getFooterHeight(2)).toBe(40);
  });

  it("returns 40 for size 3", () => {
    expect(getFooterHeight(3)).toBe(40);
  });

  it("returns 30 for size 4", () => {
    expect(getFooterHeight(4)).toBe(30);
  });

  it("returns 30 for size 5", () => {
    expect(getFooterHeight(5)).toBe(30);
  });

  it("returns 10 for an unrecognized size", () => {
    expect(getFooterHeight(0)).toBe(10);
    expect(getFooterHeight(99)).toBe(10);
  });
});

describe("getExtraFooterSpace", () => {
  it("returns 0 when assetItemSize is 3 or less", () => {
    expect(getExtraFooterSpace(1)).toBe(0);
    expect(getExtraFooterSpace(2)).toBe(0);
    expect(getExtraFooterSpace(3)).toBe(0);
  });

  it("returns assetItemSize * 8 when assetItemSize exceeds 3", () => {
    expect(getExtraFooterSpace(4)).toBe(32);
    expect(getExtraFooterSpace(5)).toBe(40);
    expect(getExtraFooterSpace(10)).toBe(80);
  });
});

describe("getAssetCategory", () => {
  it("returns 'image' for image MIME types", () => {
    expect(getAssetCategory("image/png")).toBe("image");
    expect(getAssetCategory("image/jpeg")).toBe("image");
    expect(getAssetCategory("image/webp")).toBe("image");
  });

  it("returns 'video' for video MIME types", () => {
    expect(getAssetCategory("video/mp4")).toBe("video");
    expect(getAssetCategory("video/webm")).toBe("video");
  });

  it("returns 'audio' for audio MIME types", () => {
    expect(getAssetCategory("audio/mpeg")).toBe("audio");
    expect(getAssetCategory("audio/wav")).toBe("audio");
  });

  it("returns 'model_3d' for model MIME types", () => {
    expect(getAssetCategory("model/gltf-binary")).toBe("model_3d");
    expect(getAssetCategory("model/obj")).toBe("model_3d");
  });

  it("returns 'text' for text MIME types", () => {
    expect(getAssetCategory("text/plain")).toBe("text");
    expect(getAssetCategory("text/html")).toBe("text");
  });

  it("returns 'application' for application MIME types", () => {
    expect(getAssetCategory("application/pdf")).toBe("application");
  });

  it("returns 'other' for an empty string", () => {
    expect(getAssetCategory("")).toBe("other");
  });

  it("handles content types with charset parameters", () => {
    expect(getAssetCategory("text/html; charset=utf-8")).toBe("text");
  });

  it("is case-insensitive", () => {
    expect(getAssetCategory("IMAGE/PNG")).toBe("image");
    expect(getAssetCategory("Model/GLTF-Binary")).toBe("model_3d");
  });
});

describe("calculateGridDimensions", () => {
  it("returns at least 1 column even for zero width", () => {
    const result = calculateGridDimensions(0, 3, 4);
    expect(result.columns).toBeGreaterThanOrEqual(1);
  });

  it("returns columns, itemWidth, and itemHeight", () => {
    const result = calculateGridDimensions(800, 3, 4);
    expect(result).toHaveProperty("columns");
    expect(result).toHaveProperty("itemWidth");
    expect(result).toHaveProperty("itemHeight");
  });

  it("produces square items (1:1 aspect ratio)", () => {
    const result = calculateGridDimensions(800, 3, 4);
    expect(result.itemWidth).toBe(result.itemHeight);
  });

  it("increases columns as width grows", () => {
    const narrow = calculateGridDimensions(200, 3, 4);
    const wide = calculateGridDimensions(2000, 3, 4);
    expect(wide.columns).toBeGreaterThan(narrow.columns);
  });

  it("returns a single column when width barely fits one item", () => {
    // baseSize=42, assetItemSize=1, minItemSize=42, plus spacing
    const result = calculateGridDimensions(50, 1, 4);
    expect(result.columns).toBe(1);
  });

  it("caps item size at maxItemSize (minItemSize * 1.1)", () => {
    // With a very large width and small assetItemSize, items should not exceed cap
    const result = calculateGridDimensions(5000, 1, 0);
    const maxItemSize = 42 * 1 * 1.1;
    expect(result.itemWidth).toBeLessThanOrEqual(maxItemSize);
  });
});

describe("calculateRowCount", () => {
  it("returns 0 for empty input", () => {
    expect(calculateRowCount([], 3)).toBe(0);
  });

  it("counts a single divider as 1 row", () => {
    const items: AssetOrDivider[] = [makeDivider("image", 2)];
    expect(calculateRowCount(items, 3)).toBe(1);
  });

  it("counts a divider followed by items fitting in one row", () => {
    const items: AssetOrDivider[] = [
      makeDivider("image", 2),
      makeAssetItem(createAsset({ id: "a1" }), "image"),
      makeAssetItem(createAsset({ id: "a2" }), "image")
    ];
    // 1 divider row + 1 asset row
    expect(calculateRowCount(items, 3)).toBe(2);
  });

  it("wraps items across multiple rows when they exceed columns", () => {
    const items: AssetOrDivider[] = [
      makeDivider("image", 4),
      makeAssetItem(createAsset({ id: "a1" }), "image"),
      makeAssetItem(createAsset({ id: "a2" }), "image"),
      makeAssetItem(createAsset({ id: "a3" }), "image"),
      makeAssetItem(createAsset({ id: "a4" }), "image")
    ];
    // 1 divider row + 2 asset rows (3 items in first, 1 in second)
    expect(calculateRowCount(items, 3)).toBe(3);
  });

  it("handles multiple divider sections", () => {
    const items: AssetOrDivider[] = [
      makeDivider("image", 1),
      makeAssetItem(createAsset({ id: "a1" }), "image"),
      makeDivider("video", 1),
      makeAssetItem(createAsset({ id: "v1" }), "video")
    ];
    // divider + 1 asset row + divider + 1 asset row = 4
    expect(calculateRowCount(items, 3)).toBe(4);
  });

  it("handles a single column correctly", () => {
    const items: AssetOrDivider[] = [
      makeDivider("image", 3),
      makeAssetItem(createAsset({ id: "a1" }), "image"),
      makeAssetItem(createAsset({ id: "a2" }), "image"),
      makeAssetItem(createAsset({ id: "a3" }), "image")
    ];
    // 1 divider + 3 asset rows (1 per column)
    expect(calculateRowCount(items, 1)).toBe(4);
  });

  it("handles consecutive dividers", () => {
    const items: AssetOrDivider[] = [
      makeDivider("image", 0),
      makeDivider("video", 0)
    ];
    expect(calculateRowCount(items, 3)).toBe(2);
  });
});

describe("getItemsForRow", () => {
  it("returns empty array for empty input", () => {
    expect(getItemsForRow([], 0, 3)).toEqual([]);
  });

  it("returns the divider for a divider row", () => {
    const divider = makeDivider("image", 2);
    const items: AssetOrDivider[] = [
      divider,
      makeAssetItem(createAsset({ id: "a1" }), "image"),
      makeAssetItem(createAsset({ id: "a2" }), "image")
    ];
    const row0 = getItemsForRow(items, 0, 3);
    expect(row0).toHaveLength(1);
    expect(row0[0].isDivider).toBe(true);
  });

  it("returns asset items for a non-divider row", () => {
    const items: AssetOrDivider[] = [
      makeDivider("image", 2),
      makeAssetItem(createAsset({ id: "a1" }), "image"),
      makeAssetItem(createAsset({ id: "a2" }), "image")
    ];
    const row1 = getItemsForRow(items, 1, 3);
    expect(row1).toHaveLength(2);
    expect(row1.every((item) => !item.isDivider)).toBe(true);
  });

  it("returns only 'columns' items per asset row", () => {
    const items: AssetOrDivider[] = [
      makeDivider("image", 4),
      makeAssetItem(createAsset({ id: "a1" }), "image"),
      makeAssetItem(createAsset({ id: "a2" }), "image"),
      makeAssetItem(createAsset({ id: "a3" }), "image"),
      makeAssetItem(createAsset({ id: "a4" }), "image")
    ];
    // columns=2: row0=divider, row1=[a1,a2], row2=[a3,a4]
    const row1 = getItemsForRow(items, 1, 2);
    expect(row1).toHaveLength(2);
    const row2 = getItemsForRow(items, 2, 2);
    expect(row2).toHaveLength(2);
  });

  it("returns a partial row for remaining items", () => {
    const items: AssetOrDivider[] = [
      makeDivider("image", 3),
      makeAssetItem(createAsset({ id: "a1" }), "image"),
      makeAssetItem(createAsset({ id: "a2" }), "image"),
      makeAssetItem(createAsset({ id: "a3" }), "image")
    ];
    // columns=2: row0=divider, row1=[a1,a2], row2=[a3]
    const row2 = getItemsForRow(items, 2, 2);
    expect(row2).toHaveLength(1);
  });

  it("returns empty array for out-of-bounds row index", () => {
    const items: AssetOrDivider[] = [
      makeDivider("image", 1),
      makeAssetItem(createAsset({ id: "a1" }), "image")
    ];
    expect(getItemsForRow(items, 99, 3)).toEqual([]);
  });

  it("handles multiple sections correctly", () => {
    const items: AssetOrDivider[] = [
      makeDivider("image", 1),
      makeAssetItem(createAsset({ id: "a1" }), "image"),
      makeDivider("video", 1),
      makeAssetItem(
        createAsset({ id: "v1", content_type: "video/mp4" }),
        "video"
      )
    ];
    // row0=image divider, row1=[a1], row2=video divider, row3=[v1]
    const row0 = getItemsForRow(items, 0, 3);
    expect(row0).toHaveLength(1);
    expect(row0[0].isDivider).toBe(true);
    expect(row0[0].type).toBe("image");

    const row2 = getItemsForRow(items, 2, 3);
    expect(row2).toHaveLength(1);
    expect(row2[0].isDivider).toBe(true);
    expect(row2[0].type).toBe("video");

    const row3 = getItemsForRow(items, 3, 3);
    expect(row3).toHaveLength(1);
    expect(!row3[0].isDivider).toBe(true);
  });

  it("works with single-column layout", () => {
    const items: AssetOrDivider[] = [
      makeDivider("audio", 2),
      makeAssetItem(createAsset({ id: "a1" }), "audio"),
      makeAssetItem(createAsset({ id: "a2" }), "audio")
    ];
    // columns=1: row0=divider, row1=[a1], row2=[a2]
    expect(getItemsForRow(items, 1, 1)).toHaveLength(1);
    expect(getItemsForRow(items, 2, 1)).toHaveLength(1);
  });
});
