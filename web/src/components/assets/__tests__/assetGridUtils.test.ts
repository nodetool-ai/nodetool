import { countAssetGroups, getAssetGroup, prepareItems } from "../assetGridUtils";
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

describe("prepareItems", () => {
  it("groups 3D models under their own divider", () => {
    const items = prepareItems(
      [
        createAsset({
          id: "model-1",
          name: "mesh.glb",
          content_type: "model/gltf-binary"
        })
      ],
      new Set()
    );

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      isDivider: true,
      type: "model_3d",
      count: 1
    });
    expect(items[1]).toMatchObject({
      isDivider: false,
      id: "model-1",
      type: "model_3d"
    });
  });

  it("does not fall back to other for 3D models", () => {
    const items = prepareItems(
      [
        createAsset({
          id: "model-2",
          name: "scene.glb",
          content_type: "model/gltf-binary"
        })
      ],
      new Set()
    );

    expect(items.some((item) => item.type === "other")).toBe(false);
  });

  it("keeps the divider of a collapsed group and drops its assets", () => {
    const items = prepareItems(
      [
        createAsset({ id: "img-1", content_type: "image/png" }),
        createAsset({ id: "aud-1", content_type: "audio/wav" })
      ],
      new Set(["image"])
    );

    expect(items.map((item) => (item.isDivider ? `#${item.type}` : item.id)))
      .toEqual(["#image", "#audio", "aud-1"]);
  });

  it("returns the assets without dividers when not grouped", () => {
    const items = prepareItems(
      [createAsset({ id: "img-1" }), createAsset({ id: "img-2" })],
      new Set(["image"]),
      false
    );

    expect(items.every((item) => !item.isDivider)).toBe(true);
    expect(items).toHaveLength(2);
  });

  it("groups documents apart from other files, in the filter order", () => {
    const items = prepareItems(
      [
        createAsset({ id: "font-1", content_type: "font/woff2" }),
        createAsset({ id: "pdf-1", content_type: "application/pdf" }),
        createAsset({ id: "vid-1", content_type: "video/mp4" })
      ],
      new Set()
    );

    expect(
      items.filter((item) => item.isDivider).map((item) => item.type)
    ).toEqual(["video", "application", "other"]);
  });
});

describe("getAssetGroup", () => {
  it("puts top-level types without a group under other", () => {
    expect(getAssetGroup("font/woff2")).toBe("other");
    expect(getAssetGroup("")).toBe("other");
    expect(getAssetGroup("application/pdf")).toBe("application");
    expect(getAssetGroup("model/gltf-binary")).toBe("model_3d");
  });
});

describe("countAssetGroups", () => {
  it("counts every group, zero included", () => {
    const counts = countAssetGroups([
      createAsset({ id: "a", content_type: "image/png" }),
      createAsset({ id: "b", content_type: "image/jpeg" }),
      createAsset({ id: "c", content_type: "font/ttf" })
    ]);

    expect(counts).toMatchObject({ image: 2, other: 1, video: 0 });
  });
});
