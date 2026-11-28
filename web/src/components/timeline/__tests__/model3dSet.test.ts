import { listScene, parseModel3D } from "@nodetool-ai/model3d";
import { fovDegToFocalLengthMm } from "@nodetool-ai/timeline";

import type { Asset } from "../../../stores/ApiTypes";
import {
  BLOCKOUT_SET_CONTENT_TYPE,
  BLOCKOUT_SET_GROUND_SIZE,
  blockoutSetBytes,
  blockoutSetClip
} from "../model3dSet";

describe("blockoutSetBytes", () => {
  it("is a GLB whose only object is a ground plane at the origin", () => {
    const file = parseModel3D(blockoutSetBytes("My set"));
    expect(file.format).toBe("glb");
    const objects = listScene(file.json);
    expect(objects).toHaveLength(1);
    expect(objects[0].name).toBe("Ground");
    expect(objects[0].position).toEqual([0, 0, 0]);
    expect(objects[0].scale[0]).toBeCloseTo(BLOCKOUT_SET_GROUND_SIZE / 2, 6);
  });
});

describe("blockoutSetClip", () => {
  const asset = {
    id: "a".repeat(32),
    name: "Blockout set.glb",
    content_type: BLOCKOUT_SET_CONTENT_TYPE
  } as Asset;

  it("is a shaded 3D clip on a free 35 mm camera over a flat opaque background", () => {
    const clip = blockoutSetClip(asset, "track", 1000);
    expect(clip.mediaType).toBe("model3d");
    expect(clip.currentAssetId).toBe(asset.id);
    expect(clip.startMs).toBe(1000);
    const style = clip.model3dStyle!;
    expect(style.camera.mode).toBe("free");
    expect(style.camera.position).toEqual([0, 1.6, 5]);
    expect(style.camera.target).toEqual([0, 1, 0]);
    expect(fovDegToFocalLengthMm(style.camera.fovDeg)).toBeCloseTo(35, 6);
    expect(style.background.transparent).toBe(false);
    // Shaded, so a box in front of a wall of the same grey keeps its edges.
    expect(style.lighting).toBe("studio");
  });

  it("names the clip after the set, not its file", () => {
    expect(blockoutSetClip(asset, "track", 0).name).toBe("Blockout set");
    expect(blockoutSetClip(asset, "track", 0, "Kitchen").name).toBe("Kitchen");
  });
});
