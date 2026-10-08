import { describe, expect, it } from "vitest";
import { gameAssetBinding3D } from "../src/game3d/components/assets.js";

const binding = { mediaKind: "hdri", assetId: "0123456789abcdef0123456789abcdef",
  digest: "0".repeat(64), format: "hdr", width: 2048, height: 1024,
  byteLength: 16 * 1024 * 1024, preparationVersion: "1" };
describe("HDRI preparation binding contract", () => {
  it("accepts boundary-size HDR and EXR while preserving the persistent asset id", () => {
    for (const format of ["hdr", "exr"]) {
      expect(gameAssetBinding3D.parse({ ...binding, format })).toMatchObject({
        assetId: binding.assetId, mediaKind: "hdri", format, required: true
      });
    }
  });
  it("rejects non-equirectangular dimensions and source bytes beyond budget", () => {
    for (const override of [{ width: 2049 }, { height: 1025 },
      { width: 1024 }, { byteLength: binding.byteLength + 1 },
      { width: Infinity }, { format: "png" }, { preparationVersion: "2" }]) {
      expect(gameAssetBinding3D.safeParse({ ...binding, ...override }).success).toBe(false);
    }
  });
});
