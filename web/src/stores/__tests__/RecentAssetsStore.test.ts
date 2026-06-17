import { useRecentAssetsStore } from "../RecentAssetsStore";
import type { Asset } from "../ApiTypes";

const asset = (id: string, name?: string): Asset =>
  ({
    id,
    name: name ?? id,
    content_type: "image/png",
    get_url: `https://example.com/${id}.png`
  }) as Asset;

describe("RecentAssetsStore", () => {
  beforeEach(() => {
    useRecentAssetsStore.getState().clearRecentAssets();
  });

  it("adds assets newest-first", () => {
    const { addRecentAsset } = useRecentAssetsStore.getState();
    addRecentAsset(asset("a"));
    addRecentAsset(asset("b"));
    expect(
      useRecentAssetsStore.getState().recentAssets.map((a) => a.id)
    ).toEqual(["b", "a"]);
  });

  it("de-duplicates and moves a re-used asset to the front", () => {
    const { addRecentAsset } = useRecentAssetsStore.getState();
    addRecentAsset(asset("a"));
    addRecentAsset(asset("b"));
    addRecentAsset(asset("a"));
    const ids = useRecentAssetsStore.getState().recentAssets.map((a) => a.id);
    expect(ids).toEqual(["a", "b"]);
  });

  it("caps the list at 50 entries", () => {
    const { addRecentAsset } = useRecentAssetsStore.getState();
    for (let i = 0; i < 60; i += 1) {
      addRecentAsset(asset(`a${i}`));
    }
    expect(useRecentAssetsStore.getState().recentAssets).toHaveLength(50);
    expect(useRecentAssetsStore.getState().recentAssets[0].id).toBe("a59");
  });

  it("removes an asset without affecting others", () => {
    const { addRecentAsset, removeRecentAsset } =
      useRecentAssetsStore.getState();
    addRecentAsset(asset("a"));
    addRecentAsset(asset("b"));
    removeRecentAsset("a");
    expect(
      useRecentAssetsStore.getState().recentAssets.map((a) => a.id)
    ).toEqual(["b"]);
  });

  it("renames in place", () => {
    const { addRecentAsset, renameRecentAsset } =
      useRecentAssetsStore.getState();
    addRecentAsset(asset("a", "old"));
    renameRecentAsset("a", "new");
    expect(useRecentAssetsStore.getState().recentAssets[0].name).toBe("new");
  });
});
