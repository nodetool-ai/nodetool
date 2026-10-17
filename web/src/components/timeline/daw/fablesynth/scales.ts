// Scale mode for the note sequencers. Written notes snap to a scale at
// playback: KEY uses one static scale on the chord-track key; CHORDS follows
// the chord track and gives each chord the scale that fits it best in the
// progression's key. FOLLOW keeps the written notes in their place against
// the chords they were written over (`followChords`): where the chord track
// now holds another chord, a note moves by the root distance and snaps to the
// new chord's CHORDS scale, so one line plays through any progression. The compiled map holds one remap table (a semitone offset
// per pitch class) per sixteenth; the engines add the offset at note-on.
import { CHORD_QUALITIES, PITCH_NAMES, type ArpChord } from './chords';

export const SCALES = {
  major: { name: 'MAJOR', iv: [0, 2, 4, 5, 7, 9, 11] },
  minor: { name: 'MINOR', iv: [0, 2, 3, 5, 7, 8, 10] },
  dorian: { name: 'DORIAN', iv: [0, 2, 3, 5, 7, 9, 10] },
  mixolydian: { name: 'MIXOLYDIAN', iv: [0, 2, 4, 5, 7, 9, 10] },
  phrygian: { name: 'PHRYGIAN', iv: [0, 1, 3, 5, 7, 8, 10] },
  lydian: { name: 'LYDIAN', iv: [0, 2, 4, 6, 7, 9, 11] },
  locrian: { name: 'LOCRIAN', iv: [0, 1, 3, 5, 6, 8, 10] },
  harmMinor: { name: 'HARMONIC MINOR', iv: [0, 2, 3, 5, 7, 8, 11] },
  melMinor: { name: 'MELODIC MINOR', iv: [0, 2, 3, 5, 7, 9, 11] },
  phrygDom: { name: 'PHRYGIAN DOM', iv: [0, 1, 4, 5, 7, 8, 10] },
  lydDom: { name: 'LYDIAN DOM', iv: [0, 2, 4, 6, 7, 9, 10] },
  locrian2: { name: 'LOCRIAN ♮2', iv: [0, 2, 3, 5, 6, 8, 10] },
  altered: { name: 'ALTERED', iv: [0, 1, 3, 4, 6, 8, 10] },
  wholeTone: { name: 'WHOLE TONE', iv: [0, 2, 4, 6, 8, 10] },
  dimHW: { name: 'DIM HALF-WHOLE', iv: [0, 1, 3, 4, 6, 7, 9, 10] },
  dimWH: { name: 'DIM WHOLE-HALF', iv: [0, 2, 3, 5, 6, 8, 9, 11] },
  majPent: { name: 'MAJOR PENT', iv: [0, 2, 4, 7, 9] },
  minPent: { name: 'MINOR PENT', iv: [0, 3, 5, 7, 10] },
  blues: { name: 'BLUES', iv: [0, 3, 5, 6, 7, 10] },
} as const;
export type ScaleId = keyof typeof SCALES;
export const SCALE_IDS = Object.keys(SCALES) as ScaleId[];
export type ScaleMode = 'off' | 'key' | 'chords' | 'follow';
export const SCALE_MODES: ScaleMode[] = ['off', 'key', 'chords', 'follow'];
/** The KEY scale: a fixed scale, or AUTO, the scale the chord track fits best. */
export type ScaleType = 'auto' | ScaleId;
export const SCALE_TYPES: ScaleType[] = ['auto', ...SCALE_IDS];
/** Key scales AUTO picks from, in tie-break order. */
const KEY_CANDIDATES: ScaleId[] = ['minor', 'major', 'dorian', 'mixolydian', 'phrygian', 'lydian', 'harmMinor'];
/** Chord scales CHORDS picks from, in tie-break order (no pentatonics: they drop chord colour). */
const CHORD_CANDIDATES: ScaleId[] = ['major', 'minor', 'dorian', 'mixolydian', 'phrygian', 'lydian', 'locrian',
  'harmMinor', 'melMinor', 'phrygDom', 'lydDom', 'locrian2', 'altered', 'wholeTone', 'dimHW', 'dimWH'];

/** A 12-bit pitch-class set (bit 0 = C) of `id` on `root`. */
export const scaleMask = (root: number, id: ScaleId): number =>
  (SCALES[id].iv as readonly number[]).reduce((m, i) => m | 1 << (root + i) % 12, 0);
export const chordMask = (c: Pick<ArpChord, 'root' | 'quality'>): number =>
  (CHORD_QUALITIES[c.quality].iv as readonly number[]).reduce((m, i) => m | 1 << (c.root + i) % 12, 0);
const bits = (m: number) => { let n = 0; for (let b = m & 0xfff; b; b &= b - 1) n++; return n; };

/** The key scale on `key` that holds the most chord-track sixteenths' worth of chord tones. */
export function keyScale(chords: ArpChord[], key: number): ScaleId {
  let best: ScaleId = KEY_CANDIDATES[0], bestMiss = Infinity;
  for (const id of KEY_CANDIDATES) {
    const k = scaleMask(key, id);
    const miss = chords.reduce((s, c) => s + c.length * bits(chordMask(c) & ~k), 0);
    if (miss < bestMiss) { best = id; bestMiss = miss; }
  }
  return best;
}

/** The scale on the chord's root that holds all its tones, stays closest to the
 *  key scale `keyMask`, and has the fewest avoid notes (a semitone above a chord tone). */
export function chordScale(c: Pick<ArpChord, 'root' | 'quality'>, keyMask: number): ScaleId {
  const t = chordMask(c);
  let best: ScaleId = CHORD_CANDIDATES[0], bestScore = -Infinity;
  for (const id of CHORD_CANDIDATES) {
    const s = scaleMask(c.root, id);
    const above = ((t << 1) | (t >> 11)) & 0xfff & ~t;
    const score = bits(s & t) * 100 + 4 * (bits(s & keyMask) - bits(s & ~keyMask)) - 3 * bits(s & above);
    if (score > bestScore) { best = id; bestScore = score; }
  }
  return best;
}

/** Offsets that move each pitch class to the nearest one in `mask`. A tie
 *  prefers a pitch class in `prefer` (the chord tones), else the lower one. */
export function scaleRemap(mask: number, prefer = 0): number[] {
  const has = (pc: number, m: number) => (m >> ((pc % 12) + 12) % 12 & 1) === 1;
  return Array.from({ length: 12 }, (_, pc) => {
    if (has(pc, mask)) return 0;
    for (let d = 1; d < 12; d++) {
      const down = has(pc - d, mask), up = has(pc + d, mask);
      if (down && up) return has(pc + d, prefer) && !has(pc - d, prefer) ? d : -d;
      if (down) return -d;
      if (up) return d;
    }
    return 0;
  });
}

/** A run of sixteenths that shares one scale. */
export interface ScaleSegment { start: number; length: number; root: number; scale: ScaleId; chord?: ArpChord }
/** The FOLLOW transposition between two roots: the nearest move, -6 … +5 semitones. */
export const followShift = (from: number, to: number) => (((to - from) % 12) + 18) % 12 - 6;
interface ScaleSettings { scale?: ScaleMode; scaleType?: ScaleType; chords: ArpChord[]; chordKey: number; followChords?: ArpChord[] }
export const scaleModeOf = (a: Pick<ScaleSettings, 'scale'>): ScaleMode => a.scale ?? 'off';

/** The KEY scale: the chosen type, or AUTO's best fit to the chord track. */
export const resolvedKeyScale = (a: ScaleSettings): ScaleId =>
  !a.scaleType || a.scaleType === 'auto' ? keyScale(a.chords, a.chordKey) : a.scaleType;

/** The scale of each region of a `bars`-long timeline; empty when the mode is OFF.
 *  CHORDS and FOLLOW give each chord its own scale and gaps the KEY scale. */
export function scaleSegments(a: ScaleSettings, bars: number): ScaleSegment[] {
  const mode = scaleModeOf(a), total = Math.max(1, Math.min(4, bars)) * 16;
  if (mode === 'off') return [];
  const key: ScaleSegment = { start: 0, length: total, root: a.chordKey, scale: resolvedKeyScale(a) };
  if (mode === 'key') return [key];
  const keyMask = scaleMask(key.root, key.scale), out: ScaleSegment[] = [];
  let at = 0;
  const gap = (end: number) => { if (end > at) out.push({ ...key, start: at, length: end - at }); };
  for (const c of [...a.chords].sort((x, y) => x.start - y.start)) {
    if (c.start >= total || c.start < at) continue;
    gap(c.start);
    const length = Math.min(total, c.start + c.length) - c.start;
    out.push({ start: c.start, length, root: c.root, scale: chordScale(c, keyMask), chord: c });
    at = c.start + length;
  }
  gap(total);
  return out;
}

/** The chord a chord list holds at sixteenth `pos` of its loop. */
const chordAt = (chords: ArpChord[], total: number, pos: number) =>
  chords.find(c => { const p = pos % total; return p >= c.start && p < c.start + c.length && c.start < total; });
/** Sixteenths a chord list spans, in whole bars (1–4). */
const chordSpan = (chords: ArpChord[]) => Math.max(1, Math.min(4, Math.ceil(Math.max(0, ...chords.map(c => c.start + c.length)) / 16))) * 16;
/** FOLLOW at each sixteenth: the semitone move from the written chord to the
 *  current one, and the scale segment it snaps to; null where the chord is unchanged. */
function followSteps(a: ScaleSettings, segs: ScaleSegment[], bars: number): ({ d: number; seg: ScaleSegment } | null)[] {
  const ref = a.followChords ?? a.chords, total = Math.max(1, Math.min(4, bars)) * 16, refTotal = chordSpan(ref);
  // The loop must realign both chord tracks; 3 against 4 bars is too long, so it takes the current length.
  const loop = total * refTotal / gcd(total, refTotal), len = loop <= 64 ? loop : total;
  return Array.from({ length: len }, (_, pos) => {
    const now = chordAt(a.chords, total, pos), was = chordAt(ref, refTotal, pos);
    if (now?.root === was?.root && now?.quality === was?.quality) return null;
    const seg = segs.find(g => pos % total >= g.start && pos % total < g.start + g.length)!;
    return { d: followShift(was?.root ?? a.chordKey, now?.root ?? a.chordKey), seg };
  });
}
const gcd = (x: number, y: number): number => y ? gcd(y, x % y) : x;
function followMap(a: ScaleSettings, segs: ScaleSegment[], bars: number): number[][] {
  return followSteps(a, segs, bars).map(f => {
    if (!f) return Array(12).fill(0);
    const snap = scaleRemap(segmentMask(f.seg), f.seg.chord ? chordMask(f.seg.chord) : 1 << f.seg.root);
    return snap.map((_, pc) => f.d + snap[(pc + f.d + 12) % 12]);
  });
}

/** Engine scale map: one remap table per sixteenth, looping; undefined when OFF. */
export function scaleMap(a: ScaleSettings, bars: number): number[][] | undefined {
  const segs = scaleSegments(a, bars);
  if (!segs.length) return undefined;
  if (scaleModeOf(a) === 'follow') return followMap(a, segs, bars);
  const tables = segs.map(s => scaleRemap(scaleMask(s.root, s.scale), s.chord ? chordMask(s.chord) : 1 << s.root));
  if (segs.length === 1) return [tables[0]];
  return segs.flatMap((s, i) => Array.from({ length: s.length }, () => tables[i]));
}

/** `note` moved into the scale that `map` holds at sixteenth `pos`. */
export function quantizeNote(map: number[][] | undefined, pos: number, note: number): number {
  if (!map?.length) return note;
  const t = map[((Math.floor(pos) % map.length) + map.length) % map.length];
  return Math.max(0, Math.min(127, note + t[note % 12]));
}

export const scaleLabel = (s: Pick<ScaleSegment, 'root' | 'scale'>) => `${PITCH_NAMES[s.root]} ${SCALES[s.scale].name}`;
/** The 12-bit pitch-class set a segment allows. */
export const segmentMask = (s: Pick<ScaleSegment, 'root' | 'scale'>) => scaleMask(s.root, s.scale);

/** The pitch classes each of `steps` grid sixteenths allows, or null when OFF. */
export function scaleStepMasks(a: ScaleSettings, bars: number, steps: number): number[] | null {
  const segs = scaleSegments(a, bars);
  if (!segs.length) return null;
  // FOLLOW: written notes sit against the written chords; a moved step allows its new scale moved back.
  if (scaleModeOf(a) === 'follow') {
    const f = followSteps(a, segs, bars);
    return Array.from({ length: steps }, (_, i) => {
      const g = f[i % f.length];
      if (!g) return 0xfff;
      const m = segmentMask(g.seg), r = ((-g.d % 12) + 12) % 12;
      return ((m << r) | (m >> (12 - r))) & 0xfff;
    });
  }
  const total = segs[segs.length - 1].start + segs[segs.length - 1].length;
  return Array.from({ length: steps }, (_, i) => {
    const p = i % total;
    return segmentMask(segs.find(s => p >= s.start && p < s.start + s.length)!);
  });
}
