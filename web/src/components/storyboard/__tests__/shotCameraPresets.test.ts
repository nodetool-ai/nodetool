import { presetCatalog } from "../cameraOptions";
import {
  draftPatchForPresets,
  presetModeForRender,
  previewShotCamera,
  selectedPresetIds
} from "../shotCameraPresets";

const KLING = "fal-ai/kling-video/v2.6/pro/image-to-video";
const LTX = "fal-ai/ltx-video";

describe("selectedPresetIds", () => {
  it("preselects the card whose alias matches a pre-preset movement", () => {
    expect(
      selectedPresetIds({ presetIds: [], movement: "slow push in" }, presetCatalog)
    ).toEqual(["camera.dolly-in"]);
  });

  it("selects nothing for free text", () => {
    expect(
      selectedPresetIds({ presetIds: [], movement: "drift like a leaf" }, presetCatalog)
    ).toEqual([]);
  });

  it("prefers the stored preset ids over the movement text", () => {
    expect(
      selectedPresetIds(
        { presetIds: ["camera.handheld"], movement: "slow push in" },
        presetCatalog
      )
    ).toEqual(["camera.handheld"]);
  });
});

describe("draftPatchForPresets", () => {
  it("stores the English catalogue names, joined in stack order", () => {
    expect(
      draftPatchForPresets(["camera.dolly-in", "camera.handheld"], presetCatalog)
    ).toEqual({
      presetIds: ["camera.dolly-in", "camera.handheld"],
      movement: "dolly in, handheld"
    });
  });

  it("clears the movement with the last preset", () => {
    expect(draftPatchForPresets([], presetCatalog)).toEqual({
      presetIds: [],
      movement: ""
    });
  });
});

describe("presetModeForRender", () => {
  it("matches the mode the render path compiles for", () => {
    expect(presetModeForRender("keyframe")).toBe("image_to_video");
    expect(presetModeForRender("direct")).toBe("video");
    expect(presetModeForRender("reference")).toBe("reference_to_video");
  });
});

describe("previewShotCamera", () => {
  const ids = ["camera.dolly-in", "camera.handheld"];

  it("compiles the stack for the model's family", () => {
    const preview = previewShotCamera(ids, KLING, "keyframe", presetCatalog);
    expect(preview.family).toBe("kling");
    expect(preview.fallbackIds).toEqual([]);
    expect(preview.compiled?.clause).toBeTruthy();
    expect(preview.compiled?.replacesEquipment).toBe(true);
  });

  it("names the presets that fall back to the default wording", () => {
    const preview = previewShotCamera(ids, LTX, "keyframe", presetCatalog);
    expect(preview.family).toBe("ltx");
    expect(preview.fallbackIds).toEqual(ids);
    expect(preview.compiled?.clause).toBeTruthy();
  });

  it("falls back to the default wording when no model is chosen", () => {
    const preview = previewShotCamera(ids, null, "keyframe", presetCatalog);
    expect(preview.family).toBeNull();
    expect(preview.fallbackIds).toEqual(ids);
  });

  it("returns nothing to compile without presets", () => {
    expect(previewShotCamera([], KLING, "keyframe", presetCatalog)).toEqual({
      family: "kling",
      fallbackIds: []
    });
  });

  it("reports a stack that cannot compile instead of throwing", () => {
    const preview = previewShotCamera(
      ["camera.dolly-in", "camera.orbit"],
      KLING,
      "keyframe",
      presetCatalog
    );
    expect(preview.compiled).toBeUndefined();
    expect(preview.error).toMatch(/camera\.dolly-in/);
  });
});
