import { describe, expect, it } from "vitest";

import {
  GAME_STYLE_DESCRIPTOR_TAIL,
  GAME_STYLE_PRESETS,
  STYLE_PRESETS,
  stylePresetMarker
} from "../src/style-presets.js";

describe("GAME_STYLE_PRESETS", () => {
  it("ships the six presets game-prd § 5.6 names, in order", () => {
    expect(GAME_STYLE_PRESETS.map((preset) => preset.id)).toEqual([
      "pixel-16bit",
      "pixel-8bit",
      "pixel-handheld",
      "pixel-1bit",
      "pixel-modern",
      "painted-2d"
    ]);
  });

  it("has a unique id per preset, and none that collides with a storyboard style", () => {
    const ids = GAME_STYLE_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(6);
    for (const id of ids) {
      expect(STYLE_PRESETS.some((preset) => preset.id === id)).toBe(false);
    }
  });

  it("names its thumbnail package://nodetool-base/styles/game-<id>.png", () => {
    for (const preset of GAME_STYLE_PRESETS) {
      expect(preset.thumbnail).toBe(
        `package://nodetool-base/styles/game-${preset.id}.png`
      );
    }
  });

  it("ends every descriptor with the tail every game prompt needs", () => {
    for (const preset of GAME_STYLE_PRESETS) {
      expect(preset.descriptor.endsWith(GAME_STYLE_DESCRIPTOR_TAIL)).toBe(true);
      // The tail is the end of it, not the whole of it.
      expect(preset.descriptor.length).toBeGreaterThan(
        GAME_STYLE_DESCRIPTOR_TAIL.length + 40
      );
      expect(preset.name.trim().length).toBeGreaterThan(0);
    }
  });

  it("seeds through the same marker the storyboard presets do", () => {
    const marker = stylePresetMarker(GAME_STYLE_PRESETS[0]);
    expect(marker).toMatchObject({
      kind: "style",
      system: true,
      preset_id: "pixel-16bit",
      thumbnail: "package://nodetool-base/styles/game-pixel-16bit.png"
    });
  });
});
