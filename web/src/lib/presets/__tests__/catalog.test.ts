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

import { setPresetCatalog } from "../catalog";
import presetData from "@nodetool-ai/presets/preset-catalog.json";
import { makePreset } from "../../../test-utils/presetFixtures";

it("updates existing catalogue exports when a runtime pack is installed or removed", () => {
  const preset = makePreset("camera.community", { author: "Community" });
  try {
    setPresetCatalog([...presetData, preset]);
    expect(presetCatalog.getPreset(preset.id)?.author).toBe("Community");
    expect(CAMERA_PRESETS.some(row => row.id === preset.id)).toBe(true);
    expect(MEDIA_PRESETS.some(row => row.id === preset.id)).toBe(true);
    setPresetCatalog(presetData);
    expect(presetCatalog.getPreset(preset.id)).toBeUndefined();
    expect(CAMERA_PRESETS.some(row => row.id === preset.id)).toBe(false);
  } finally {
    setPresetCatalog(presetData);
  }
});
