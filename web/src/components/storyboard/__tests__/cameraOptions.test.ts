import { createCatalog } from "@nodetool-ai/presets";
import presetData from "@nodetool-ai/presets/preset-catalog.json";
import { MOVEMENT_OPTIONS } from "../cameraOptions";

it("offers catalogue movement names and preserves every camera alias", () => {
  const cameras = createCatalog(presetData).filter({ kind: "camera" });
  expect(cameras).toHaveLength(40);
  for (const preset of cameras) {
    if (preset.slot === "move") {
      expect(MOVEMENT_OPTIONS).toContain(preset.name);
    }
    for (const alias of preset.aliases) {
      expect(MOVEMENT_OPTIONS).toContain(alias);
    }
  }
  expect(new Set(MOVEMENT_OPTIONS).size).toBe(MOVEMENT_OPTIONS.length);
});
