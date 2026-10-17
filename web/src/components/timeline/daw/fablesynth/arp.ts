import { chordNotes, PROGRESSIONS, progressionChords, validChords, type ArpChord } from './chords';
import { SCALE_TYPES, type ScaleMode, type ScaleType } from './scales';
import { COMP_VOICINGS, compSequence, parseCompSteps, STRUM_DIRS, STRUM_MAX_MS, type ArpStyle, type CompVoicing, type StrumDir } from './comp';

export type ArpOrder = 'up' | 'down' | 'updown' | 'played' | 'random';
export interface ArpState {
  notes: number[];
  order: ArpOrder;
  rate: number;
  octaves: number;
  gate: number;
  hits: boolean[];
  accents: boolean[];
  slides?: boolean[];
  seed: number;
  input: ArpInput;
  latch: boolean;
  /** Chord track (input 'chords'): 16th-grid chords over the sequence length. */
  chords: ArpChord[];
  chordKey: number;
  chordOctave: number;
  /** SQ-4 clips: chord-track length in bars (1–4, default 4), and whether the
   *  progression is shared with the scene's other linked clips. */
  chordBars?: number;
  chordLink?: boolean;
  /** Scale mode for the written notes (src/scales.ts): KEY snaps them to one
   *  scale on `chordKey`, CHORDS to each chord's scale. Absent = OFF / AUTO. */
  scale?: ScaleMode;
  scaleType?: ScaleType;
  /** FOLLOW: the chords the written notes were written over. */
  followChords?: ArpChord[];
  /** 'comp' plays a voicing per step (`comp` voice masks, `ties` hold) instead of one note. */
  style: ArpStyle;
  comp: number[];
  ties: boolean[];
  /** Comp feel: milliseconds between strummed notes, their direction, and the voicing spread. */
  strum: number;
  strumDir: StrumDir;
  voicing: CompVoicing;
}
export type ArpInput = 'stored' | 'keys' | 'chords';
/** The one playback mode a sequencer runs: written notes, arpeggio, or chord comping. */
export type SeqMode = 'seq' | 'arp' | 'chords';
export const seqMode = (arpOn: boolean, style: ArpStyle): SeqMode => !arpOn ? 'seq' : style === 'comp' ? 'chords' : 'arp';
export const modeStyle = (mode: Exclude<SeqMode, 'seq'>): ArpStyle => mode === 'chords' ? 'comp' : 'arp';
export const newArp = (): ArpState => ({ notes: [50, 53, 57, 60], order: 'up', rate: .25,
  octaves: 1, gate: .65, hits: Array(16).fill(true), accents: Array.from({ length: 16 }, (_, i) => i % 4 === 0),
  seed: 1, input: 'stored', latch: false, chords: progressionChords(PROGRESSIONS[10], 9).chords, chordKey: 9, chordOctave: 3,
  style: 'arp', comp: parseCompSteps('BC . . . C . . . C . . . C . . .').comp, ties: Array(16).fill(false),
  strum: 0, strumDir: 'up', voicing: 'close' });
export const noteName = (n: number) => ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][n % 12] + (Math.floor(n / 12) - 1);
function arpPool(a: ArpState, input: number[]): number[] {
  const base = [...new Set(input)].filter(n => Number.isInteger(n) && n >= 0 && n <= 127);
  if (a.order !== 'played') base.sort((x, y) => x - y);
  const pool = Array.from({ length: a.octaves }, (_, oct) => base.map(n => n + oct * 12)).flat().filter(n => n <= 127);
  if (a.order === 'down') pool.reverse();
  if (a.order === 'updown' && pool.length > 2) pool.push(...pool.slice(1, -1).reverse());
  return pool;
}
const nextSeed = (seed: number) => (Math.imul(seed, 1664525) + 1013904223) >>> 0;
export function arpNotes(a: ArpState, input = a.notes): number[] {
  const pool = arpPool(a, input);
  let seed = a.seed >>> 0;
  return Array.from({ length: 16 }, (_, i) => {
    seed = nextSeed(seed);
    return pool.length ? pool[(a.order === 'random' ? seed >>> 8 : i) % pool.length] : -1;
  });
}
/** Arp steps until the rate grid and a `bars`-long chord track realign (a multiple of 16). */
export function arpCycle(rate: number, bars: number): number {
  const total = bars * 16, r16 = rate * 4;
  let len = 16;
  while (len < 1024 && Math.abs(len * r16 / total - Math.round(len * r16 / total)) > 1e-6) len += 16;
  return len;
}
/** Sixteenth position of arp step `i` inside a `bars`-long chord track. */
export const arpStepPos = (rate: number, bars: number, i: number) => (i * rate * 4) % (bars * 16);
/** The worklet's note loop: 16 steps, or a full chord-track cycle. The pattern
 *  restarts on every chord change; gaps in the chord track rest. */
export function arpSequence(a: ArpState, input: number[], bars: number): number[] {
  if (a.style === 'comp') return compSequence(a, input, bars).notes;
  if (a.input !== 'chords') return arpNotes(a, input);
  const total = bars * 16, base = (a.chordOctave + 1) * 12;
  let seed = a.seed >>> 0, prev: ArpChord | undefined, j = 0;
  return Array.from({ length: arpCycle(a.rate, bars) }, (_, i) => {
    seed = nextSeed(seed);
    const pos = arpStepPos(a.rate, bars, i) + 1e-6;
    const c = a.chords.find(c => pos >= c.start && pos < Math.min(total, c.start + c.length));
    if (c !== prev) { j = 0; prev = c; }
    if (!c) return -1;
    const pool = arpPool(a, chordNotes(c, base));
    return pool.length ? pool[(a.order === 'random' ? seed >>> 8 : j++) % pool.length] : -1;
  });
}
/** Worklet config: `notes` per step; comp adds each step's voicing (`stack`) and
 *  its length in steps (`lens`, 0 = held by a tie). */
export function arpCompile(a: ArpState, input: number[], bars: number): { notes: number[]; stack?: number[][]; lens?: number[]; strum?: number } {
  return a.style === 'comp' ? { ...compSequence(a, input, bars), strum: a.strum ?? 0 } : { notes: arpSequence(a, input, bars) };
}
export function loadArp(storageKey = 'wt1-arp-v1', fresh = newArp()): ArpState {
  try {
    const a = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (!a || !Array.isArray(a.notes) || !Array.isArray(a.hits) || !Array.isArray(a.accents)) return fresh;
    return { ...fresh, notes: a.notes.filter((n: number) => Number.isInteger(n) && n >= 24 && n <= 96).slice(0, 24),
      input: a.input === 'chords' ? 'chords' : 'stored',
      chords: validChords(a.chords) ?? fresh.chords,
      chordKey: Number.isInteger(a.chordKey) && a.chordKey >= 0 && a.chordKey < 12 ? a.chordKey : fresh.chordKey,
      chordOctave: Number.isInteger(a.chordOctave) && a.chordOctave >= 0 && a.chordOctave <= 6 ? a.chordOctave : fresh.chordOctave,
      order: ['up', 'down', 'updown', 'played', 'random'].includes(a.order) ? a.order : 'up',
      rate: [.125, .25, .5, 1, 1/3, 1/6, .375, .75].includes(a.rate) ? a.rate : .25,
      octaves: [1, 2, 3].includes(a.octaves) ? a.octaves : 1,
      gate: Number.isFinite(a.gate) ? Math.max(.05, Math.min(.95, a.gate)) : .65,
      hits: fresh.hits.map((_, i) => a.hits[i] !== false), accents: fresh.accents.map((_, i) => a.accents[i] === true),
      ...(fresh.slides ? { slides: fresh.slides.map((_, i) => a.slides?.[i] === true) } : {}),
      seed: Number.isInteger(a.seed) ? a.seed : 1,
      style: a.style === 'comp' ? 'comp' : 'arp',
      comp: fresh.comp.map((v, i) => Number.isInteger(a.comp?.[i]) && a.comp[i] >= 0 && a.comp[i] < 16 ? a.comp[i] : v),
      ties: fresh.ties.map((v, i) => typeof a.ties?.[i] === 'boolean' ? a.ties[i] : v),
      strum: Number.isInteger(a.strum) && a.strum >= 0 && a.strum <= STRUM_MAX_MS ? a.strum : fresh.strum,
      strumDir: STRUM_DIRS.includes(a.strumDir) ? a.strumDir : fresh.strumDir,
      voicing: COMP_VOICINGS.includes(a.voicing) ? a.voicing : fresh.voicing,
      ...(a.scale === 'key' || a.scale === 'chords' || a.scale === 'follow' ? { scale: a.scale } : {}),
      ...(SCALE_TYPES.includes(a.scaleType) ? { scaleType: a.scaleType } : {}),
      ...(validChords(a.followChords) ? { followChords: validChords(a.followChords)! } : {}) };
  } catch { return fresh; }
}
