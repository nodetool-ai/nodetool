import {
  MIDI_INSTRUMENT_CHOICES,
  findInstrumentChoice,
  findInstrumentPreset,
  presetIdForInstrument,
  type MidiInstrument
} from "@nodetool-ai/timeline";

export const DEFAULT_TIMELINE_INSTRUMENT = findInstrumentPreset("wt1-prime-lead")!.instrument;

export interface InstrumentSelectOption {
  value: string;
  label: string;
}

/** The instrument select: one entry per offered instrument type. */
export const INSTRUMENT_TYPE_OPTIONS: readonly InstrumentSelectOption[] =
  MIDI_INSTRUMENT_CHOICES.map((choice) => ({
    value: choice.type,
    label: choice.name
  }));

/**
 * The two select values for a track's voice. A legacy `subtractive` voice
 * matches no instrument, and an edited voice matches no preset, so either
 * value can be empty.
 */
export function instrumentSelection(instrument: MidiInstrument): {
  type: string;
  presetId: string;
  presetOptions: readonly InstrumentSelectOption[];
} {
  const choice = findInstrumentChoice(instrument.type);
  if (!choice) {
    return { type: "", presetId: "", presetOptions: [] };
  }
  // "WT-1 Prime Lead" reads as "Prime Lead" next to the WT-1 instrument.
  const prefix = `${choice.name.split(" ")[0]} `;
  return {
    type: choice.type,
    presetId: presetIdForInstrument(instrument) ?? "",
    presetOptions: choice.presets.map((preset) => ({
      value: preset.id,
      label: preset.name.startsWith(prefix)
        ? preset.name.slice(prefix.length)
        : preset.name
    }))
  };
}

/** The voice a new instrument type starts with: its first preset. */
export function instrumentForType(type: string): MidiInstrument | undefined {
  return MIDI_INSTRUMENT_CHOICES.find((choice) => choice.type === type)
    ?.presets[0]?.instrument;
}
