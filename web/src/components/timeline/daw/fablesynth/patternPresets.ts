// WT-1 pattern presets: authored melodic lines that load into the note
// sequencer without touching the patch. All lines sit in C minor so they
// follow the patch's own tuning; bars play in order (chain 0..n-1).
// Notation: src/shared/stepNotation.ts. Native copy: juce/source/dsp/PatternPresetCatalog.h.

import { makeEmptyPatterns, writePattern, type Patterns } from './noteseq';
import { parseBar, type NotatedPreset } from './shared/stepNotation';

export const NOTE_PATTERN_PRESETS: NotatedPreset[] = [
  { name: 'MINOR ARP', bars: [
    "C D# G C' G D# C D# G C' G D# C D# G A#",
    "G# C D# G# D# C G# C D# G# D# C G# C D# G",
    "F G# C' F' C' G# F G# C' F' C' G# F G# C' D#'",
    "G A# D' G' D' A# G A# D' G' D' A# G A# D' B",
  ] },
  { name: 'DUB STABS', bars: [
    ". . C! . . . . . . . D# . . . . .",
    ". . C! . . . . . . . A#, . . . . .",
    ". . G#,! . . . . . . . C . . . . .",
    ". . A#,! . . . . . . . G, . . . G, .",
  ] },
  { name: 'HOUSE STABS', bars: [
    ". . G! . . G . . . . G! . . A# - .",
    ". . G! . . G . . . . F! . . D# - .",
  ] },
  { name: 'PLUCK MELODY', bars: [
    "G! . D#' . C' . G . A# . G . F . D# .",
    "F! . G . G# . G . F . D# . D . C .",
    "G! . D#' . C' . G . A# . C' . D' . D#' .",
    "F'! - . D#' . D' . C' - . . . . . . .",
  ] },
  { name: 'TRANCE GATE', bars: [
    "C! C C' C C C! C C' C C C! C C' C C C",
    "G#,! G#, G# G#, G#, G#,! G#, G# G#, G#, G#,! G#, G# G#, G#, G#,",
    "D#! D# D#' D# D# D#! D# D#' D# D# D#! D# D#' D# D# D#",
    "A#,! A#, A# A#, A#, A#,! A#, A# A#, A#, A#,! A#, A# A#, A#, A#,",
  ] },
  { name: 'BERLIN SEQUENCE', bars: [
    "C! G C' D#' C' G C! G C' D#' C' G C! G A# G",
    "C! G C' D#' C' G C! G C' D#' C' G C! G F' D#'",
  ] },
  { name: 'SYNTHWAVE LEAD', bars: [
    "C'! - - - - - A# - G - - - - - D# -",
    "F! - - - - - G - G# - - - G - - -",
    "C'! - - - - - D' - D#' - - - D' - C' -",
    "A#! - - - - - - - G - - - - - - -",
  ] },
  { name: 'CALL + RESPONSE', bars: [
    "C'! . A# . G . . . . . . . . . . .",
    ". . . . . . . . G . F . D#! - - -",
    "C'! . A# . G . D#' . . . . . . . . .",
    ". . . . . . . . G F . D . C! - -",
  ] },
  { name: 'FUNK RIFF', bars: [
    "C! . C . D#! . . C . . F . F# . G! .",
    ". . A# . G . F . D#! . . C . . . .",
  ] },
  { name: 'AMBIENT DRONE', bars: [
    "C - - - - - - - - - - - - - - -",
    "G#, - - - - - - - - - - - - - - -",
    "D# - - - - - - - - - - - - - - -",
    "A#, - - - - - - - - - - - - - - -",
  ] },
];

/** Packed WT-1 patterns + chain for one catalog entry. */
export function notePresetSequence(preset: NotatedPreset): { patterns: Patterns; chain: number[] } {
  let patterns = makeEmptyPatterns();
  preset.bars.forEach((bar, i) => { patterns = writePattern(patterns, i, parseBar(bar)); });
  return { patterns, chain: preset.bars.map((_, i) => i) };
}
