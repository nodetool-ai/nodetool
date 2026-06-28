import {
  appendItems,
  assetToItem,
  collectionElementType,
  collectionType,
  readItems,
  type CollectionItem
} from "../collectionItems";
import type { Asset } from "../../stores/ApiTypes";

const asset = (over: Partial<Asset>): Asset =>
  ({
    id: "a1",
    user_id: "u",
    parent_id: null,
    name: "pic.png",
    content_type: "image/png",
    get_url: "http://x/pic.png",
    ...over
  }) as Asset;

const img = (uri: string, assetId?: string): CollectionItem => ({
  type: "image",
  uri,
  ...(assetId ? { asset_id: assetId } : {})
});

describe("collectionItems", () => {
  describe("assetToItem", () => {
    it("maps an image asset to an item with a durable asset_id", () => {
      expect(assetToItem(asset({ id: "img-1" }))).toEqual({
        type: "image",
        uri: "http://x/pic.png",
        asset_id: "img-1",
        name: "pic.png"
      });
    });

    it("maps a video asset to a video item", () => {
      const item = assetToItem(
        asset({ content_type: "video/mp4", get_url: "http://x/v.mp4" })
      );
      expect(item?.type).toBe("video");
    });
  });

  describe("appendItems", () => {
    it("appends to an empty collection, locking the type", () => {
      const result = appendItems([], [img("a", "1")]);
      expect(result).toEqual({ ok: true, items: [img("a", "1")], added: 1 });
    });

    it("appends a matching-type item in order", () => {
      const result = appendItems([img("a", "1")], [img("b", "2")]);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.items.map((i) => i.asset_id)).toEqual(["1", "2"]);
    });

    it("rejects a mismatched type and reports the expected type", () => {
      const result = appendItems(
        [img("a", "1")],
        [{ type: "video", uri: "v", asset_id: "2" }]
      );
      expect(result).toEqual({
        ok: false,
        reason: "type-mismatch",
        expected: "image"
      });
    });

    it("skips duplicates by asset_id", () => {
      const result = appendItems([img("a", "1")], [img("a-again", "1")]);
      expect(result).toEqual({ ok: false, reason: "duplicate", expected: "image" });
    });

    it("skips duplicates by uri when no asset_id is present", () => {
      const result = appendItems([img("same")], [img("same")]);
      expect(result.ok).toBe(false);
    });

    it("adds only the matching subset of a mixed incoming batch", () => {
      const result = appendItems(
        [img("a", "1")],
        [img("b", "2"), { type: "video", uri: "v", asset_id: "3" }, img("c", "4")]
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.added).toBe(2);
        expect(result.items.map((i) => i.asset_id)).toEqual(["1", "2", "4"]);
      }
    });

    it("reports empty for an empty incoming batch", () => {
      expect(appendItems([img("a", "1")], [])).toEqual({
        ok: false,
        reason: "empty"
      });
    });
  });

  describe("collectionType / readItems", () => {
    it("returns the first item's type", () => {
      expect(collectionType([img("a"), img("b")])).toBe("image");
      expect(collectionType([])).toBeUndefined();
    });

    it("reads only record items from arbitrary values", () => {
      expect(readItems([img("a"), "junk", null, 5])).toEqual([img("a")]);
      expect(readItems(undefined)).toEqual([]);
    });
  });

  describe("collectionElementType", () => {
    it.each(["image", "video", "audio"])(
      "narrows the output handle to %s for a media collection",
      (kind) => {
        expect(collectionElementType([{ type: kind, uri: "u" }])).toEqual({
          type: kind,
          optional: false,
          values: null,
          type_args: [],
          type_name: null
        });
      }
    );

    it("returns null for an empty collection", () => {
      expect(collectionElementType([])).toBeNull();
    });

    it("returns null for non-narrowable kinds (stays any)", () => {
      expect(collectionElementType([{ type: "text", uri: "u" }])).toBeNull();
      expect(collectionElementType([{ type: "json", uri: "u" }])).toBeNull();
    });
  });
});
