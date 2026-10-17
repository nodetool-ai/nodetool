// Compact text notation for authored WT-1 / BL-1 pattern presets. One bar is
// 16 whitespace-separated tokens, one per 16th step:
//   .        rest
//   -        hold: the previous note lasts one more step (not across bars)
//   C D# Bb  note in the lane octave (0..11; flats map to the sharp lane)
//   ,  '     suffix: octave down / up (-1 / +1)
//   !  ~     suffix: accent / slide into this note (slide: BL-1 only)
// juce/source/dsp/StepNotation.h parses the same strings for the native
// catalogs; keep both parsers in step.

export interface NotatedStep {
  on: boolean;
  note: number;
  oct: number;
  acc: boolean;
  slide: boolean;
  duration: number;
}

export interface NotatedPreset {
  name: string;
  bars: string[];
}

const NOTE_INDEX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const TOKEN = /^([A-G])([#b]?)([,']?)([!~]*)$/;

export function parseBar(bar: string): NotatedStep[] {
  const tokens = bar.trim().split(/\s+/);
  if (tokens.length !== 16) throw new Error(`bar needs 16 steps, got ${tokens.length}: ${bar}`);
  const steps: NotatedStep[] = [];
  let last: NotatedStep | null = null;
  for (const token of tokens) {
    const rest: NotatedStep = { on: false, note: 0, oct: 0, acc: false, slide: false, duration: 1 };
    if (token === '.') { steps.push(rest); last = null; continue; }
    if (token === '-') {
      if (!last) throw new Error(`hold without a note: ${bar}`);
      last.duration += 1;
      steps.push(rest);
      continue;
    }
    const m = TOKEN.exec(token);
    if (!m) throw new Error(`bad step token "${token}"`);
    const [, letter, accidental, octave, flags] = m;
    const note = (NOTE_INDEX[letter] + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0) + 12) % 12;
    last = {
      on: true,
      note,
      oct: octave === ',' ? -1 : octave === "'" ? 1 : 0,
      acc: flags.includes('!'),
      slide: flags.includes('~'),
      duration: 1,
    };
    steps.push(last);
  }
  return steps;
}
