import { CAMERA_PRESETS, EFFECT_PRESETS, MEDIA_PRESETS, presetCatalog } from "../catalog";

describe("preset catalogue consumers", () => {
  it("offers looks alongside camera and effect presets in the composer", () => {
    expect(presetCatalog.filter({ kind: "look" }).length).toBeGreaterThanOrEqual(24);
    expect(MEDIA_PRESETS.length).toBeGreaterThan(0);
    expect(MEDIA_PRESETS.some((preset) => preset.kind === "look")).toBe(true);
    expect(MEDIA_PRESETS).toEqual(
      expect.arrayContaining([...CAMERA_PRESETS, ...EFFECT_PRESETS])
    );
  });
});
