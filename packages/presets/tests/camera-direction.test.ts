import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createCatalog, compileCameraPresets, cameraPresetIdsForMovement } from "../src/index.js";

const catalog = createCatalog(JSON.parse(readFileSync(new URL("../preset-catalog.json", import.meta.url), "utf8")));

describe("camera presets", () => {
  it("resolves a pre-change board's movement without rewriting it", () => {
    const camera = { movement: "slow push in" };
    expect(cameraPresetIdsForMovement(camera.movement, catalog)).toEqual(["camera.dolly-in"]);
    expect(camera).toEqual({ movement: "slow push in" });
    expect(cameraPresetIdsForMovement("custom swoop", catalog)).toEqual([]);
    expect(cameraPresetIdsForMovement(undefined, catalog)).toEqual([]);
  });

  it("preserves equipment unless a rig is selected", () => {
    expect(compileCameraPresets(["camera.dolly-in"], { catalog, modelId: "kling", mode: "video" })?.replacesEquipment).toBe(false);
    expect(compileCameraPresets(["camera.dolly-in", "camera.steadicam"], { catalog, modelId: "kling", mode: "video" })?.replacesEquipment).toBe(true);
    expect(compileCameraPresets([], { catalog, modelId: "kling", mode: "video" })).toBeUndefined();
  });
});
