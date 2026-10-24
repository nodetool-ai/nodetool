import { describe, expect, it } from "@jest/globals";
import { findInstrumentPreset } from "@nodetool-ai/timeline";

import { buildFablesynthFactoryPresets } from "../fablesynthFactoryPresets";
import { FACTORY_PRESETS } from "../../fablesynth/presets";
import { FACTORY_PATCHES } from "../../fablesynth/bass/patches";
import { FACTORY_KITS } from "../../fablesynth/drum/kits";

/** Ids a handwritten timeline preset already holds. */
const HANDWRITTEN = new Set(["dr1-tr-void"]);

describe("FableSynth factory presets", () => {
  const built = buildFablesynthFactoryPresets();

  it("converts every WT-1 preset, BL-1 patch and DR-1 kit", () => {
    expect(built).toHaveLength(
      FACTORY_PRESETS.length + FACTORY_PATCHES.length + FACTORY_KITS.length
    );
    expect(new Set(built.map((preset) => preset.id)).size).toBe(built.length);
  });

  it("matches the generated copy in @nodetool-ai/timeline", () => {
    for (const preset of built) {
      if (HANDWRITTEN.has(preset.id)) continue;
      // A failure here means `npm run fablesynth-presets` was not rerun.
      expect(findInstrumentPreset(preset.id)).toEqual(preset);
    }
  });
});
