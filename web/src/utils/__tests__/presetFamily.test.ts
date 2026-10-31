import { presetCatalog } from "../../components/storyboard/cameraOptions";
import { presetFamilyOf, presetsWithoutFragment } from "../presetFamily";

describe("presetFamily", () => {
  it("names the family of the chosen model", () => {
    expect(
      presetFamilyOf({ id: "fal-ai/kling-video/v2.6/pro/text-to-video", provider: "fal_ai" }, "video")
    ).toBe("kling");
    expect(presetFamilyOf(null, "video")).toBeNull();
    expect(presetFamilyOf({ id: "some/unknown-model" }, "video")).toBeNull();
  });

  it("lists presets whose family has no fragment", () => {
    const dolly = presetCatalog.getPreset("camera.dolly-in");
    expect(dolly).toBeDefined();
    const presets = dolly ? [dolly] : [];
    expect(
      presetsWithoutFragment(presets, { id: "fal-ai/kling-video/v2.6/pro/text-to-video" }, "video")
    ).toEqual([]);
    expect(
      presetsWithoutFragment(presets, { id: "minimax/h3/text-to-video" }, "video")
    ).toEqual(presets);
    expect(presetsWithoutFragment(presets, { id: "some/unknown-model" }, "video")).toEqual(presets);
    expect(presetsWithoutFragment(presets, null, "video")).toEqual([]);
  });
});
