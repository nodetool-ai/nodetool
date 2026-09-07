/**
 * The FableSynth instruments (github.com/georgi/fablesynth), ported to the
 * offline renderer: WT-1 the wavetable synth, BL-1 the acid bassline, DR-1 the
 * drum machine.
 *
 * Only the names a caller outside the package needs are re-exported — the table
 * catalogue for an instrument picker, and the shipped kit.
 */

export {
  ALL_TABLE_NAMES,
  DRUM_TABLE_NAMES,
  WAVETABLE_NAMES,
  type DrumTableName,
  type TableName,
  type WavetableName
} from "./wavetables.js";
export { SVF_TYPES, type SvfType } from "./dsp.js";
export { TR_VOID_KIT } from "./kits.js";
export { padForNote } from "./dr1.js";
