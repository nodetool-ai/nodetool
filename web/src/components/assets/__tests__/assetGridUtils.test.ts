import { prepareItems } from "../assetGridUtils";
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
      new Set(["model_3d"])
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
      new Set(["model_3d", "other"])
    );

    expect(items.some((item) => item.type === "other")).toBe(false);
  });
});
