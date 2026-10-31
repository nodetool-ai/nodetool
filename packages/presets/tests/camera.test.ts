import { existsSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { createCatalog } from "../src/index.js";

const legacyMovements = [
  "static",
  "slow push in",
  "slow pull out",
  "push in slow",
  "pull back reveal",
  "dolly in",
  "dolly out",
  "dolly zoom (vertigo)",
  "truck left",
  "truck right",
  "pedestal up",
  "pedestal down",
  "pan left",
  "pan right",
  "whip pan",
  "tilt up",
  "tilt down",
  "crane up",
  "crane down",
  "orbit",
  "orbit left",
  "orbit right",
  "360 orbit",
  "zoom in",
  "zoom out",
  "crash zoom in",
  "crash zoom out",
  "tracking",
  "handheld",
  "handheld follow",
  "FPV drone fly-through",
  "top-down rise",
  "snorricam",
  "bullet time",
  "rack focus",
  "through-object pass",
  "low-angle hero rise",
  "overhead spiral"
];
const catalog = createCatalog(JSON.parse(readFileSync(new URL("../preset-catalog.json", import.meta.url), "utf8")));

it("resolves every legacy movement to exactly one camera preset", () => {
  for (const movement of legacyMovements) {
    const matches = catalog.filter({ kind: "camera" }).filter((preset) =>
      [preset.name, ...preset.aliases].some((alias) => alias.toLowerCase() === movement.toLowerCase()));
    expect(matches).toHaveLength(1);
    expect(catalog.byAlias(movement)).toEqual(matches[0]);
  }
});
it("provides forty camera presets with all required families and valid conflicts", () => {
  const cameras = catalog.filter({ kind: "camera" });
  expect(cameras).toHaveLength(40);
  for (const preset of cameras) {
    expect(preset.modes).toEqual(["video", "image_to_video", "reference_to_video"]);
    // Every camera preset ships a rendered preview backed by a checked-in run record.
    expect(preset.preview?.url).toMatch(/^https:\/\//);
    expect(preset.preview?.poster).toMatch(/^https:\/\//);
    expect(existsSync(new URL(`../${preset.preview?.run}`, import.meta.url))).toBe(true);
    for (const family of ["default", "kling", "seedance", "veo", "wan"]) {
      expect(preset.prompt[family]).toEqual(expect.any(String));
    }
    for (const conflict of preset.conflicts) {
      expect(catalog.getPreset(conflict)?.conflicts).toContain(preset.id);
    }
  }
});
