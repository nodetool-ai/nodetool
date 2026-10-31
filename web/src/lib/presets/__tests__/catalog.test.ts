import { CAMERA_PRESETS, EFFECT_PRESETS, MEDIA_PRESETS, presetCatalog } from "../catalog";

describe("preset catalogue consumers", () => {
  it("loads looks without adding them to the existing composer picker", () => {
    expect(presetCatalog.filter({ kind: "look" }).length).toBeGreaterThanOrEqual(24);
    expect(MEDIA_PRESETS.length).toBeGreaterThan(0);
    expect(MEDIA_PRESETS.every((preset) => preset.kind !== "look")).toBe(true);
    expect(MEDIA_PRESETS).toEqual(expect.arrayContaining([...CAMERA_PRESETS, ...EFFECT_PRESETS]));
  });
});
