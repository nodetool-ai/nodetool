import { hasAssetDrag, readAssetDrag } from "../assetDrag";
import { DRAG_DATA_MIME } from "../../../../../lib/dragdrop/serialization";

/** Minimal DataTransfer stand-in: a key/value map + a `types` list. */
const fakeDataTransfer = (entries: Record<string, string>): DataTransfer =>
  ({
    types: Object.keys(entries),
    files: [] as unknown as FileList,
    getData: (key: string) => entries[key] ?? ""
  }) as unknown as DataTransfer;

describe("assetDrag", () => {
  it("reads a single full asset from a drop", () => {
    const asset = { id: "a1", name: "cat.png", content_type: "image/png" };
    const dt = fakeDataTransfer({
      [DRAG_DATA_MIME]: JSON.stringify({ type: "asset", payload: asset }),
      asset: JSON.stringify(asset)
    });
    const drag = readAssetDrag(dt);
    expect(drag).toEqual({ assets: [asset], pendingIds: [] });
  });

  it("reads pending ids from a multi-asset drop", () => {
    const dt = fakeDataTransfer({
      [DRAG_DATA_MIME]: JSON.stringify({
        type: "assets-multiple",
        payload: ["a1", "a2"]
      })
    });
    const drag = readAssetDrag(dt);
    expect(drag).toEqual({ assets: [], pendingIds: ["a1", "a2"] });
  });

  it("returns null for non-asset drags", () => {
    expect(readAssetDrag(fakeDataTransfer({}))).toBeNull();
    expect(readAssetDrag(null)).toBeNull();
  });

  it("detects asset drags during dragover without reading payloads", () => {
    expect(hasAssetDrag(fakeDataTransfer({ asset: "x" }))).toBe(true);
    expect(hasAssetDrag(fakeDataTransfer({ selectedAssetIds: "x" }))).toBe(true);
    expect(hasAssetDrag(fakeDataTransfer({ [DRAG_DATA_MIME]: "x" }))).toBe(true);
    expect(hasAssetDrag(fakeDataTransfer({ "text/plain": "x" }))).toBe(false);
    expect(hasAssetDrag(null)).toBe(false);
  });
});
