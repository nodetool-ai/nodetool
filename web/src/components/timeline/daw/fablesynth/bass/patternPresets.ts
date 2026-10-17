// BL-1 pattern presets: authored bass lines that load into the pitch
// sequencer without touching the patch. All lines sit in C minor so they
// follow the patch's own tuning; bars play in order (chain 0..n-1).
// Notation: src/shared/stepNotation.ts. Native copy: juce/source/dsp/PatternPresetCatalog.h.

import { parseBar, type NotatedPreset } from '../shared/stepNotation';
import { makeEmptyPatterns, writePattern, type Patterns } from './seq';

export const BASS_PATTERN_PRESETS: NotatedPreset[] = [
  { name: 'ACID ROLLER', bars: [
    "C! C, . D#~ C . G! F#~ C . A#, C~ . D#'! C~ .",
    "C! C, . D#~ C . G! F#~ C . A#, C~ . D#'! C~ .",
    "C! C, . D#~ C . G! F#~ C . A#, C~ . D#'! C~ .",
    "C! . C F~ . C, G~ . C! D# . A#,~ C . C'!~ .",
  ] },
  { name: 'DUB TECHNO', bars: [
    "C, - - . . . . . . . . . C, - . .",
    ". . . . . . G, - - . . . . . . .",
    "C, - - . . . . . . . . . C, - . .",
    ". . . . . . A#, - - . . . G, - . .",
  ] },
  { name: 'DEEP HOUSE', bars: [
    ". . C - . . C' . . . C - . D# . .",
    ". . C - . . C' . . . G, - . A#, . .",
    ". . G#, - . . G#' . . . G#, - . C . .",
    ". . A#, - . . A# . . . G, - . F, . .",
  ] },
  { name: 'ROLLING TECHNO', bars: [
    ". C C! C . C C! C . C C! C . C C! C",
    ". C C! C . C C! C . C C! D# . C C! A#,",
  ] },
  { name: 'MINIMAL PULSE', bars: [
    "C! . . C . . C . . C! . . C . . .",
    "C! . . C . . C . . C! . . D# . C .",
  ] },
  { name: 'ELECTRO FUNK', bars: [
    "C! . . C . . D# . C . G, . A#, . C' .",
    "C! . . C . . D# . F . D# . C . G, A#,",
  ] },
  { name: 'UK GARAGE', bars: [
    "C! - . . . . . C, . . D# - . . . .",
    "C! - . . . . . C, . . G - F . D# .",
    "G#,! - . . . . . G#, . . C - . . . .",
    "A#,! - . . . . . A#, . . D# - D . A#, .",
  ] },
  { name: 'DISCO OCTAVES', bars: [
    "C, C . C, C . C, C . C, C . C, C . C,",
    "G#, G# . G#, G# . G#, G# . A#, A# . A#, A# . A#,",
  ] },
  { name: 'SLIDE WALK', bars: [
    "C! . D#~ . F~ . G! . A#~ . G~ . F . D#~ .",
    "C! . C'~ . A#~ . G! . F~ . D#~ . D . C~ .",
  ] },
  { name: 'REESE', bars: [
    "C, - - - - - - - - - - - D#, - - -",
    "F, - - - - - - - G, - - - - - - -",
  ] },
];

/** Packed BL-1 patterns + chain for one catalog entry. */
export function bassPresetSequence(preset: NotatedPreset): { patterns: Patterns; chain: number[] } {
  let patterns = makeEmptyPatterns();
  preset.bars.forEach((bar, i) => { patterns = writePattern(patterns, i, parseBar(bar)); });
  return { patterns, chain: preset.bars.map((_, i) => i) };
}
