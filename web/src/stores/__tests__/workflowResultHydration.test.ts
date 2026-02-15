import { Asset } from "../ApiTypes";
import {
  assetToResultValue,
  groupWorkflowAssetsByNodeResult
} from "../workflowResultHydration";

const baseAsset = (overrides: Partial<Asset>): Asset => ({
  id: "asset-1",
  user_id: "user-1",
  workflow_id: "wf-1",
  parent_id: "user-1",
  name: "file.bin",
  content_type: "application/octet-stream",
  metadata: null,
  created_at: "2026-01-01T00:00:00Z",
  get_url: null,
  thumb_url: null,
  ...overrides
});

describe("workflowResultHydration", () => {
  it("maps image assets to image refs with asset uri", () => {
    const result = assetToResultValue(
      baseAsset({
        id: "img-1",
        name: "preview.png",
        content_type: "image/png"
      })
    );

    expect(result).toMatchObject({
      type: "image",
      asset_id: "img-1",
      uri: "asset://img-1.png"
    });
  });

  it("maps video assets and keeps duration", () => {
    const result = assetToResultValue(
      baseAsset({
        id: "vid-1",
        name: "clip.mp4",
        content_type: "video/mp4",
        duration: 3.5
      })
    );

    expect(result).toMatchObject({
      type: "video",
      asset_id: "vid-1",
      uri: "asset://vid-1.mp4",
      duration: 3.5
    });
  });

  it("groups assets by node id and sorts by created_at", () => {
    const grouped = groupWorkflowAssetsByNodeResult([
      baseAsset({
        id: "a2",
        node_id: "node-1",
        name: "two.png",
        content_type: "image/png",
        created_at: "2026-01-01T00:00:02Z"
      }),
      baseAsset({
        id: "a1",
        node_id: "node-1",
        name: "one.png",
        content_type: "image/png",
        created_at: "2026-01-01T00:00:01Z"
      }),
      baseAsset({
        id: "a3",
        node_id: "node-2",
        name: "note.txt",
        content_type: "text/plain",
        created_at: "2026-01-01T00:00:03Z"
      }),
      baseAsset({
        id: "no-node",
        node_id: null,
        name: "ignored.png",
        content_type: "image/png"
      })
    ]);

    expect(Object.keys(grouped)).toEqual(["node-1", "node-2"]);
    expect((grouped["node-1"] as any[])[0]).toMatchObject({
      asset_id: "a1",
      uri: "asset://a1.png"
    });
    expect((grouped["node-1"] as any[])[1]).toMatchObject({
      asset_id: "a2",
      uri: "asset://a2.png"
    });
    expect((grouped["node-2"] as any[])[0]).toMatchObject({
      type: "document",
      asset_id: "a3"
    });
  });
});

