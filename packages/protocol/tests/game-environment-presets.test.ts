import { expect, it } from "vitest";
import { GAME_ENVIRONMENT_PRESET_IDS_3D, gameEnvironmentPresetId3D, gameEnvironmentPreset3D, getGameEnvironmentPreset3D } from "../src/game3d/presets.js";

it.each(GAME_ENVIRONMENT_PRESET_IDS_3D)("provides a bounded complete %s environment and sun", (id) => {
  const preset = getGameEnvironmentPreset3D(id);
  expect(gameEnvironmentPreset3D.parse(preset)).toEqual(preset);
  expect(preset.environment.sky).toBeDefined();
  expect(preset.environment.fog?.near).toBeLessThan(preset.environment.fog?.far ?? 0);
  expect(preset.environment.postProcessing?.enabled).toBe(true);
  expect(preset.sun.light.kind).toBe("directional");
});

it("returns independent nested copies of preset data", () => {
  const original = getGameEnvironmentPreset3D("sunny-day");
  const edited = getGameEnvironmentPreset3D("sunny-day");
  edited.environment.ambient.intensity = 4;
  edited.sun.rotation[0] = 0;
  expect(getGameEnvironmentPreset3D("sunny-day")).toEqual(original);
});

it("rejects unknown names and unbounded preset data", () => {
  expect(gameEnvironmentPresetId3D.safeParse("constructor").success).toBe(false);
  const preset = getGameEnvironmentPreset3D("night");
  preset.sun.light.intensity = 101;
  expect(gameEnvironmentPreset3D.safeParse(preset).success).toBe(false);
});
