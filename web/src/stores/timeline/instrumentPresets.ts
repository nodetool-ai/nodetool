import { MIDI_INSTRUMENT_PRESETS, findInstrumentPreset } from "@nodetool-ai/timeline";

/** Instruments offered for new and edited tracks. Legacy voices still load. */
export const TIMELINE_INSTRUMENT_PRESETS = MIDI_INSTRUMENT_PRESETS.filter(
  preset => preset.instrument.type !== "subtractive"
);
export const DEFAULT_TIMELINE_INSTRUMENT = findInstrumentPreset("wt1-prime-lead")!.instrument;
