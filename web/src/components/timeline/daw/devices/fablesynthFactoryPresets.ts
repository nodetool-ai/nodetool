/**
 * FableSynth's factory sounds as timeline instrument presets.
 *
 * Every WT-1 preset, BL-1 patch and DR-1 kit, converted through the same
 * param ⇄ instrument mapping the live devices use, so a track set to one of
 * them opens in its device with the factory knobs. `npm run
 * fablesynth-presets` writes the result into `@nodetool-ai/timeline`, where
 * the headless hosts can read it without this module's FableSynth sources.
 */

import {
  findInstrumentPreset,
  type BassMidiInstrument,
  type MidiInstrumentPreset
} from "@nodetool-ai/timeline";

import { FACTORY_PRESETS, resolvePresetMods } from "../fablesynth/presets";
import { FACTORY_PATCHES, patchToState } from "../fablesynth/bass/patches";
import { FACTORY_KITS, kitToState } from "../fablesynth/drum/kits";
import { wt1CoreFromParams, wt1ParamDiff } from "./wt1Params";
import { bl1InstrumentFromParams } from "./bl1Params";
import { dr1InstrumentFromParams } from "./dr1Params";

/**
 * "VELVET PAD" → "Velvet Pad". A part with a digit ("808", "CC0") or of two
 * letters ("TR") stays as it is.
 */
function displayName(name: string): string {
  return name.replace(/[A-Z0-9]+/g, (part) =>
    /\d/.test(part) || part.length <= 2
      ? part
      : part.charAt(0) + part.slice(1).toLowerCase()
  );
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\+/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildFablesynthFactoryPresets(): MidiInstrumentPreset[] {
  const bassBase = findInstrumentPreset("bl1-acid")?.instrument;
  if (bassBase?.type !== "bass") {
    throw new Error("The bl1-acid preset is missing");
  }
  const wt1 = FACTORY_PRESETS.map((preset): MidiInstrumentPreset => {
    const params = resolvePresetMods(preset.params, preset.mods);
    return {
      id: `wt1-${slug(preset.name)}`,
      name: `WT-1 ${displayName(preset.name)}`,
      instrument: {
        type: "wavetable",
        ...wt1CoreFromParams(params),
        fableParams: wt1ParamDiff(params)
      }
    };
  });
  const bl1 = FACTORY_PATCHES.map((patch): MidiInstrumentPreset => ({
    id: `bl1-${slug(patch.name)}`,
    name: `BL-1 ${displayName(patch.name)}`,
    instrument: bl1InstrumentFromParams(
      bassBase as BassMidiInstrument,
      patchToState(patch).params
    )
  }));
  const dr1 = FACTORY_KITS.map((kit): MidiInstrumentPreset => {
    const state = kitToState(kit);
    return {
      id: `dr1-${slug(kit.name)}`,
      name: `DR-1 ${displayName(kit.name)}`,
      instrument: dr1InstrumentFromParams(
        { type: "drum", baseNote: 36, pads: [], gainDb: 0 },
        state.params,
        state.padNames
      )
    };
  });
  return [...wt1, ...bl1, ...dr1];
}
