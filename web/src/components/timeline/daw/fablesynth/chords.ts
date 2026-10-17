// Chord track for the WT-1 / BL-1 arpeggiator. Chords sit on a 16th grid that
// spans the device's sequence length; the arp walks each chord's voicing and
// restarts its pattern on every chord change.
export interface ArpChord { start: number; length: number; root: number; quality: ChordQuality; inversion: number }

export const CHORD_QUALITIES = {
  maj: { label: '', name: 'MAJOR', iv: [0, 4, 7] },
  min: { label: 'm', name: 'MINOR', iv: [0, 3, 7] },
  dim: { label: '°', name: 'DIMINISHED', iv: [0, 3, 6] },
  aug: { label: '+', name: 'AUGMENTED', iv: [0, 4, 8] },
  sus2: { label: 'sus2', name: 'SUS 2', iv: [0, 2, 7] },
  sus4: { label: 'sus4', name: 'SUS 4', iv: [0, 5, 7] },
  five: { label: '5', name: 'POWER', iv: [0, 7, 12] },
  six: { label: '6', name: 'MAJOR 6', iv: [0, 4, 7, 9] },
  m6: { label: 'm6', name: 'MINOR 6', iv: [0, 3, 7, 9] },
  dom7: { label: '7', name: 'DOMINANT 7', iv: [0, 4, 7, 10] },
  maj7: { label: 'maj7', name: 'MAJOR 7', iv: [0, 4, 7, 11] },
  m7: { label: 'm7', name: 'MINOR 7', iv: [0, 3, 7, 10] },
  mMaj7: { label: 'm(maj7)', name: 'MINOR MAJ 7', iv: [0, 3, 7, 11] },
  m7b5: { label: 'm7♭5', name: 'HALF-DIM 7', iv: [0, 3, 6, 10] },
  dim7: { label: '°7', name: 'DIMINISHED 7', iv: [0, 3, 6, 9] },
  aug7: { label: '+7', name: 'AUGMENTED 7', iv: [0, 4, 8, 10] },
  sus7: { label: '7sus4', name: '7 SUS 4', iv: [0, 5, 7, 10] },
  add9: { label: 'add9', name: 'ADD 9', iv: [0, 4, 7, 14] },
  madd9: { label: 'm(add9)', name: 'MINOR ADD 9', iv: [0, 3, 7, 14] },
  dom9: { label: '9', name: 'DOMINANT 9', iv: [0, 4, 7, 10, 14] },
  maj9: { label: 'maj9', name: 'MAJOR 9', iv: [0, 4, 7, 11, 14] },
  m9: { label: 'm9', name: 'MINOR 9', iv: [0, 3, 7, 10, 14] },
  dom7b9: { label: '7♭9', name: '7 FLAT 9', iv: [0, 4, 7, 10, 13] },
  dom7s9: { label: '7♯9', name: '7 SHARP 9', iv: [0, 4, 7, 10, 15] },
  m11: { label: 'm11', name: 'MINOR 11', iv: [0, 3, 7, 10, 14, 17] },
  dom11: { label: '11', name: 'DOMINANT 11', iv: [0, 4, 7, 10, 14, 17] },
  maj13: { label: 'maj13', name: 'MAJOR 13', iv: [0, 4, 7, 11, 14, 21] },
  dom13: { label: '13', name: 'DOMINANT 13', iv: [0, 4, 7, 10, 14, 21] },
} as const;
export type ChordQuality = keyof typeof CHORD_QUALITIES;
export const PITCH_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const chordName = (c: Pick<ArpChord, 'root' | 'quality'>) => PITCH_NAMES[c.root] + CHORD_QUALITIES[c.quality].label;

/** MIDI notes of a chord voiced from `base` (the C of its octave), root first. */
export function chordNotes(c: ArpChord, base: number): number[] {
  const notes = CHORD_QUALITIES[c.quality].iv.map(i => base + c.root + i);
  const inv = Math.max(0, Math.min(notes.length - 1, c.inversion | 0));
  return [...notes.slice(inv), ...notes.slice(0, inv).map(n => n + 12)].filter(n => n >= 0 && n <= 127);
}

/** Inserts a chord, trimming or splitting the chords it overlaps. */
export function placeChord(chords: ArpChord[], c: ArpChord): ArpChord[] {
  const end = c.start + c.length;
  const out: ArpChord[] = [];
  for (const o of chords) {
    const oEnd = o.start + o.length;
    if (oEnd <= c.start || o.start >= end) { out.push(o); continue; }
    if (o.start < c.start) out.push({ ...o, length: c.start - o.start });
    if (oEnd > end) out.push({ ...o, start: end, length: oEnd - end });
  }
  return [...out, c].sort((a, b) => a.start - b.start);
}

export function validChords(v: unknown): ArpChord[] | null {
  if (!Array.isArray(v)) return null;
  const ok = v.every(c => c && Number.isInteger(c.start) && c.start >= 0 && c.start < 64 &&
    Number.isInteger(c.length) && c.length > 0 && c.start + c.length <= 64 &&
    Number.isInteger(c.root) && c.root >= 0 && c.root < 12 && c.quality in CHORD_QUALITIES &&
    Number.isInteger(c.inversion) && c.inversion >= 0 && c.inversion < 6);
  return ok ? v.slice(0, 64).map(c => ({ start: c.start, length: c.length, root: c.root, quality: c.quality, inversion: c.inversion })) : null;
}

// Progressions as [semitones above the key, quality, length in beats].
type Step = [number, ChordQuality, number];
export interface Progression { name: string; mood: string; steps: Step[] }
const bar = (deg: number, q: ChordQuality): Step => [deg, q, 4];
export const PROGRESSIONS: Progression[] = [
  { name: 'I–V–vi–IV', mood: 'POP', steps: [bar(0, 'maj'), bar(7, 'maj'), bar(9, 'min'), bar(5, 'maj')] },
  { name: 'vi–IV–I–V', mood: 'POP', steps: [bar(9, 'min'), bar(5, 'maj'), bar(0, 'maj'), bar(7, 'maj')] },
  { name: 'I–vi–IV–V', mood: 'DOO-WOP', steps: [bar(0, 'maj'), bar(9, 'min'), bar(5, 'maj'), bar(7, 'maj')] },
  { name: 'I–IV–vi–V', mood: 'POP', steps: [bar(0, 'maj'), bar(5, 'maj'), bar(9, 'min'), bar(7, 'maj')] },
  { name: 'I–iii–IV–V', mood: 'BALLAD', steps: [bar(0, 'maj'), bar(4, 'min'), bar(5, 'maj'), bar(7, 'maj')] },
  { name: 'Canon', mood: 'CLASSICAL', steps: [[0, 'maj', 2], [7, 'maj', 2], [9, 'min', 2], [4, 'min', 2], [5, 'maj', 2], [0, 'maj', 2], [5, 'maj', 2], [7, 'maj', 2]] },
  { name: 'IV–V–iii–vi', mood: 'ROYAL ROAD', steps: [bar(5, 'maj7'), bar(7, 'dom7'), bar(4, 'm7'), bar(9, 'm7')] },
  { name: 'I–♭VII–IV–I', mood: 'MIXOLYDIAN', steps: [bar(0, 'maj'), bar(10, 'maj'), bar(5, 'maj'), bar(0, 'maj')] },
  { name: 'I–III–IV–iv', mood: 'BITTERSWEET', steps: [bar(0, 'maj'), bar(4, 'maj'), bar(5, 'maj'), bar(5, 'min')] },
  { name: 'I–IV', mood: 'VAMP', steps: [[0, 'maj', 8], [5, 'maj', 8]] },
  { name: 'i–VI–III–VII', mood: 'EPIC MINOR', steps: [bar(0, 'min'), bar(8, 'maj'), bar(3, 'maj'), bar(10, 'maj')] },
  { name: 'i–VII–VI–V', mood: 'ANDALUSIAN', steps: [bar(0, 'min'), bar(10, 'maj'), bar(8, 'maj'), bar(7, 'maj')] },
  { name: 'i–iv–v–i', mood: 'NATURAL MINOR', steps: [bar(0, 'min'), bar(5, 'min'), bar(7, 'min'), bar(0, 'min')] },
  { name: 'i–iv–V–i', mood: 'HARMONIC MINOR', steps: [bar(0, 'min'), bar(5, 'min'), bar(7, 'dom7'), bar(0, 'min')] },
  { name: 'i–VI–iv–V', mood: 'DRAMATIC', steps: [bar(0, 'min'), bar(8, 'maj'), bar(5, 'min'), bar(7, 'maj')] },
  { name: 'i–VII–VI–VII', mood: 'TRANCE', steps: [bar(0, 'min'), bar(10, 'maj'), bar(8, 'maj'), bar(10, 'maj')] },
  { name: 'i–♭II', mood: 'PHRYGIAN', steps: [[0, 'min', 8], [1, 'maj', 8]] },
  { name: 'i7–IV7', mood: 'DORIAN', steps: [[0, 'm7', 8], [5, 'dom7', 8]] },
  { name: 'i7–iv7', mood: 'DUB VAMP', steps: [[0, 'm7', 8], [5, 'm7', 8]] },
  { name: 'i9–VImaj7', mood: 'DEEP HOUSE', steps: [[0, 'm9', 8], [8, 'maj7', 8]] },
  { name: 'ii–V–I', mood: 'JAZZ', steps: [bar(2, 'm7'), bar(7, 'dom7'), [0, 'maj7', 8]] },
  { name: 'I–vi–ii–V', mood: 'TURNAROUND', steps: [bar(0, 'maj7'), bar(9, 'm7'), bar(2, 'm7'), bar(7, 'dom7')] },
  { name: 'vi–ii–V–I', mood: 'CIRCLE', steps: [bar(9, 'm7'), bar(2, 'm7'), bar(7, 'dom7'), bar(0, 'maj7')] },
  { name: 'ii9–V13–I9–vi9', mood: 'NEO SOUL', steps: [bar(2, 'm9'), bar(7, 'dom13'), bar(0, 'maj9'), bar(9, 'm9')] },
  { name: 'I7–IV7–I7–V7', mood: 'BLUES', steps: [bar(0, 'dom7'), bar(5, 'dom7'), bar(0, 'dom7'), bar(7, 'dom7')] },
  { name: 'iiø–V7♭9–i', mood: 'MINOR JAZZ', steps: [bar(2, 'm7b5'), bar(7, 'dom7b9'), [0, 'm9', 8]] },
];

/** A progression's chords in `key`, plus the bar count it needs (1–4). */
export function progressionChords(p: Progression, key: number): { chords: ArpChord[]; bars: number } {
  let start = 0;
  const chords = p.steps.map(([deg, quality, beats]) => {
    const c = { start, length: beats * 4, root: (key + deg) % 12, quality, inversion: 0 };
    start += beats * 4;
    return c;
  });
  return { chords, bars: Math.max(1, Math.min(4, Math.ceil(start / 16))) };
}

/** Browser groups for the progression library, by mood. */
export const PROGRESSION_FAMILIES = [
  { name: 'MAJOR', moods: ['POP', 'DOO-WOP', 'BALLAD', 'CLASSICAL', 'ROYAL ROAD', 'BITTERSWEET'] },
  { name: 'MINOR', moods: ['EPIC MINOR', 'ANDALUSIAN', 'NATURAL MINOR', 'HARMONIC MINOR', 'DRAMATIC'] },
  { name: 'MODAL', moods: ['MIXOLYDIAN', 'PHRYGIAN', 'DORIAN'] },
  { name: 'CLUB', moods: ['VAMP', 'TRANCE', 'DUB VAMP', 'DEEP HOUSE'] },
  { name: 'JAZZ & SOUL', moods: ['JAZZ', 'TURNAROUND', 'CIRCLE', 'NEO SOUL', 'BLUES', 'MINOR JAZZ'] },
];
export const progressionFamily = (p: Progression) => PROGRESSION_FAMILIES.find(f => f.moods.includes(p.mood))?.name ?? 'OTHER';

/** The library progression the chord track holds in `key`, or -1. Inversions do not count. */
export function progressionIndex(chords: ArpChord[], key: number): number {
  return PROGRESSIONS.findIndex(p => {
    const want = progressionChords(p, key).chords;
    return want.length === chords.length && want.every((w, i) => {
      const c = chords[i];
      return c.start === w.start && c.length === w.length && c.root === w.root && c.quality === w.quality;
    });
  });
}
