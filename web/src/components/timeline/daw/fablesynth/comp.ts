// Comping for the WT-1 arpeggiator. Each 16th step strikes a voicing of the
// current chord (or the stored / played notes) instead of a single arp note.
// Voice masks adapt to any chord size: LOW is the lowest voice, TOP the highest,
// MID every voice between them, BASS the root one octave below the voicing.
// A tied step holds the previous voicing; a chord change re-strikes it.
import { chordNotes, type ArpChord } from './chords';

export type ArpStyle = 'arp' | 'comp';
export const COMP_BASS = 1, COMP_LOW = 2, COMP_MID = 4, COMP_TOP = 8;
export const COMP_ROWS = [['TOP', COMP_TOP], ['MID', COMP_MID], ['LOW', COMP_LOW], ['BASS', COMP_BASS]] as const;
/** Most notes one comp step strikes. */
export const COMP_MAX_NOTES = 8;

export type StrumDir = 'up' | 'down' | 'alt';
export const STRUM_DIRS: StrumDir[] = ['up', 'down', 'alt'];
/** Voicing spread applied to the chord before the voice masks pick from it. */
export type CompVoicing = 'close' | 'drop2' | 'drop24' | 'open';
export const COMP_VOICINGS: CompVoicing[] = ['close', 'drop2', 'drop24', 'open'];
export const STRUM_MAX_MS = 60;

/** Steps: '.' rest, '-' tie, else voices B L M T (C = L+M+T, U = M+T); '>' accents. */
export function parseCompSteps(steps: string): { comp: number[]; ties: boolean[]; accents: boolean[] } {
  const tokens = steps.trim().split(/\s+/);
  const mask = (t: string) => [...t].reduce((m, ch) => m | ({ B: COMP_BASS, L: COMP_LOW, M: COMP_MID, T: COMP_TOP,
    C: COMP_LOW | COMP_MID | COMP_TOP, U: COMP_MID | COMP_TOP } as Record<string, number>)[ch] | 0, 0);
  return { comp: tokens.map(mask), ties: tokens.map(t => t === '-'), accents: tokens.map(t => t.endsWith('>')) };
}
/** The inverse of parseCompSteps. */
export function formatCompSteps(comp: number[], ties: boolean[], accents: boolean[]): string {
  return comp.map((m, i) => {
    if (ties[i]) return '-';
    if (!m) return '.';
    const v = m & (COMP_LOW | COMP_MID | COMP_TOP);
    const body = (m & COMP_BASS ? 'B' : '') + (v === (COMP_LOW | COMP_MID | COMP_TOP) ? 'C' : v === (COMP_MID | COMP_TOP) ? 'U'
      : (v & COMP_LOW ? 'L' : '') + (v & COMP_MID ? 'M' : '') + (v & COMP_TOP ? 'T' : ''));
    return body + (accents[i] ? '>' : '');
  }).join(' ');
}

/** Spreads an ascending voicing: DROP 2 lowers the second-highest voice an
 *  octave, DROP 2+4 also the fourth-highest, OPEN raises every other voice. */
export function spreadVoicing(v: number[], kind: CompVoicing): number[] {
  const n = v.length, out = [...v];
  if (n >= 3 && (kind === 'drop2' || kind === 'drop24')) out[n - 2] -= 12;
  if (n >= 4 && kind === 'drop24') out[n - 4] -= 12;
  if (n >= 3 && kind === 'open') for (let i = 1; i < n; i += 2) out[i] += 12;
  return out.filter(x => x >= 0 && x <= 127).sort((x, y) => x - y);
}
/** Strum direction of a step. ALT strums like a guitarist's arm: down on the
 *  beat side of each 8th, or of each 16th when the pattern plays odd 16ths. */
export function strumDown(dir: StrumDir, r: number, sixteenths: boolean): boolean {
  if (dir !== 'alt') return dir === 'down';
  return sixteenths ? r % 2 === 0 : r % 4 < 2;
}

/** Notes a voice mask selects from an ascending voicing and its bass note. */
export function compVoices(mask: number, voicing: number[], bass: number): number[] {
  const n = voicing.length, out: number[] = [];
  if (!n) return out;
  if (mask & COMP_BASS && bass >= 0) out.push(bass);
  if (mask & COMP_LOW) out.push(voicing[0]);
  if (mask & COMP_MID) out.push(...voicing.slice(1, -1));
  if (mask & COMP_TOP) out.push(voicing[n - 1]);
  return [...new Set(out)].sort((x, y) => x - y).slice(0, COMP_MAX_NOTES);
}

interface CompSource {
  style?: ArpStyle; comp: number[]; ties: boolean[];
  input: string; chords: ArpChord[]; chordOctave: number; rate: number;
  voicing?: CompVoicing; strumDir?: StrumDir;
}
const cycle = (rate: number, bars: number) => {
  const total = bars * 16, r16 = rate * 4;
  let len = 16;
  while (len < 1024 && Math.abs(len * r16 / total - Math.round(len * r16 / total)) > 1e-6) len += 16;
  return len;
};
/** One comp loop: 16 steps, or a full chord-track cycle. Rests hold -1 / [].
 *  Each stack lists its notes in strum order; `notes` holds the lowest. */
export function compSequence(a: CompSource, input: number[], bars: number): { notes: number[]; stack: number[][]; lens: number[] } {
  const chordMode = a.input === 'chords', total = bars * 16, base = (a.chordOctave + 1) * 12;
  const length = chordMode ? cycle(a.rate, bars) : 16;
  const stored = [...new Set(input)].filter(n => Number.isInteger(n) && n >= 0 && n <= 127).sort((x, y) => x - y);
  const chordAt = (i: number) => {
    if (!chordMode) return stored.length ? -2 : -1;
    const pos = (i * a.rate * 4) % total + 1e-6;
    return a.chords.findIndex(c => pos >= c.start && pos < Math.min(total, c.start + c.length));
  };
  const kind = a.voicing ?? 'close', dir = a.strumDir ?? 'up';
  const sixteenths = a.comp.some((m, r) => m && !a.ties[r] && r % 2 === 1);
  const voicing = (c: number): [number[], number] => {
    if (c === -2) return [spreadVoicing(stored, kind), stored[0] - 12];
    const ch = a.chords[c];
    return [spreadVoicing(chordNotes(ch, base), kind), base - 12 + ch.root];
  };
  const chords = Array.from({ length }, (_, i) => chordAt(i));
  const run = (held: number, emit?: (i: number, notes: number[] | null) => void) => {
    for (let i = 0; i < length; i++) {
      const r = i % 16, c = chords[i], changed = c !== chords[(i + length - 1) % length];
      if (c === -1) { held = 0; emit?.(i, []); continue; }
      const mask = a.ties[r] ? held : a.comp[r];
      if (a.ties[r] && held && !changed) { emit?.(i, null); continue; }
      held = mask;
      if (!mask) { emit?.(i, []); continue; }
      const [v, bass] = voicing(c);
      const notes = compVoices(mask, v, bass);
      emit?.(i, strumDown(dir, r, sixteenths) ? notes.reverse() : notes);
    }
    return held;
  };
  // A tie on the loop's first step holds whatever the loop ends on.
  const stack: number[][] = Array(length), lens: number[] = Array(length).fill(1);
  run(run(0), (i, notes) => { if (notes) stack[i] = notes; else { stack[i] = []; lens[i] = 0; } });
  for (let i = 0; i < length; i++) {
    if (!stack[i].length) continue;
    let n = 1;
    while (n < length && lens[(i + n) % length] === 0) n++;
    lens[i] = n;
  }
  return { notes: stack.map(s => s.length ? Math.min(...s) : -1), stack, lens };
}
