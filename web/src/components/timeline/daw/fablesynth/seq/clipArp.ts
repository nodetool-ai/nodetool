import { arpCompile, newArp, seqMode, type ArpState, type SeqMode } from '../arp';
import { validChords, type ArpChord } from '../chords';
import { b64ToBytes, NOTE_STRIDE, type ClipDoc, type MachineId, type SessionDoc } from './protocol';
import { COMP_VOICINGS, STRUM_DIRS, STRUM_MAX_MS } from '../comp';
import { SCALE_MODES, SCALE_TYPES, scaleMap } from '../scales';

export interface ClipArp { enabled: boolean; settings: ArpState }
export interface ArpConfig {
  notes: number[]; hits: boolean[]; accents: boolean[]; slides?: boolean[];
  rate: number; gate: number;
  /** Comp style: each step's voicing and its length in steps (0 = tied). */
  stack?: number[][]; lens?: number[]; strum?: number;
}
export function copyClipArp(arp: ClipArp): ClipArp {
  const a = arp.settings;
  return { enabled: arp.enabled, settings: { ...a, notes: [...a.notes], hits: [...a.hits], accents: [...a.accents],
    ...(a.slides ? { slides: [...a.slides] } : {}), ...(a.comp ? { comp: [...a.comp] } : {}), ...(a.ties ? { ties: [...a.ties] } : {}),
    ...(a.chords ? { chords: a.chords.map(c => ({ ...c })) } : {}),
    ...(a.followChords ? { followChords: a.followChords.map(c => ({ ...c })) } : {}) } };
}
/** A clip's chord-track length in bars. */
export const clipChordBars = (a: Pick<ArpState, 'chordBars'>) => a.chordBars ?? 4;
/** The mode a clip plays: its written notes, or its arp in arpeggio or chord-comping style. */
export function clipSeqMode(clip: { arp?: ClipArp } | null | undefined): SeqMode {
  return seqMode(!!clip?.arp?.enabled, clip?.arp?.settings.style ?? 'arp');
}
export function newClipArp(machine: MachineId): ClipArp {
  return { enabled: false, settings: { ...newArp(),
    // BL-1 chord tracks sit in the bass register.
    ...(machine === 'BL1' ? { notes: [36, 39, 43, 46], slides: Array(16).fill(false), chordOctave: 2 } : {}) } };
}
/** A chord track stored with the arp switched off: SEQ still plays the
 *  written notes, and ARP plays `chords` from `octave` (the chord base is
 *  that octave's C). Demo sessions use it to carry their harmony. */
export function chordTrackArp(machine: MachineId, chords: ArpChord[], key: number, octave: number, link = true): ClipArp {
  const end = Math.max(16, ...chords.map(c => c.start + c.length));
  return { enabled: false, settings: { ...newClipArp(machine).settings, input: 'chords', chords: chords.map(c => ({ ...c })),
    chordKey: key, chordOctave: Math.max(0, Math.min(6, octave)), chordBars: Math.min(4, Math.ceil(end / 16)), chordLink: link } };
}
/** The arp octave of a note clip's lowest written note (WT-1 plays from C3 = 48, BL-1 from C2 = 36). */
export function clipChordOctave(machine: MachineId, clip: ClipDoc): number {
  const bytes = b64ToBytes(clip.pattern);
  let low = Infinity;
  for (let o = 0; o + 2 < bytes.length; o += NOTE_STRIDE) {
    if (bytes[o] & 1) low = Math.min(low, Math.min(11, bytes[o + 1]) + 12 * (Math.min(2, bytes[o + 2]) - 1));
  }
  const midi = (machine === 'BL1' ? 36 : 48) + (Number.isFinite(low) ? low : 0);
  return Math.floor(midi / 12) - 1;
}
export function compileClipArp(clip: ClipDoc): ArpConfig | undefined {
  if (!clip.arp?.enabled) return;
  const a = clip.arp.settings;
  // Clips saved before comp styles lack the comp fields.
  const comp = a.style === 'comp' && a.comp && a.ties;
  // A chord-track clip loops one chord cycle; a note list loops 16 steps.
  const bars = a.input === 'chords' ? clipChordBars(a) : 1;
  return { ...arpCompile(comp ? a : { ...a, style: 'arp' }, a.notes, bars), hits: [...a.hits], accents: [...a.accents],
    ...(a.slides ? { slides: [...a.slides] } : {}), rate: a.rate, gate: a.gate };
}
/** The scale map for a clip's written notes: only SEQ mode plays them. */
export function compileClipScale(clip: ClipDoc): number[][] | undefined {
  const a = clip.arp?.settings;
  return a && !clip.arp!.enabled ? scaleMap(a, clipChordBars(a)) : undefined;
}
export function validClipArp(value: unknown): value is ClipArp {
  if (!value || typeof value !== 'object') return false;
  const { enabled, settings: a } = value as ClipArp;
  const lane = (v: unknown) => Array.isArray(v) && v.length === 16 && v.every(b => typeof b === 'boolean');
  return typeof enabled === 'boolean' && !!a &&
    Array.isArray(a.notes) && a.notes.length <= 128 && a.notes.every(n => Number.isInteger(n) && n >= 0 && n <= 127) &&
    ['up', 'down', 'updown', 'played', 'random'].includes(a.order) &&
    [.125, .25, .5, 1, 1/3, 1/6, .375, .75].includes(a.rate) &&
    [1, 2, 3].includes(a.octaves) && Number.isFinite(a.gate) && a.gate >= .05 && a.gate <= .95 &&
    lane(a.hits) && lane(a.accents) && (a.slides === undefined || lane(a.slides)) &&
    (a.style === undefined || a.style === 'arp' || a.style === 'comp') && (a.ties === undefined || lane(a.ties)) &&
    (a.strum === undefined || (Number.isInteger(a.strum) && a.strum >= 0 && a.strum <= STRUM_MAX_MS)) &&
    (a.strumDir === undefined || STRUM_DIRS.includes(a.strumDir)) && (a.voicing === undefined || COMP_VOICINGS.includes(a.voicing)) &&
    (a.comp === undefined || (Array.isArray(a.comp) && a.comp.length === 16 && a.comp.every(m => Number.isInteger(m) && m >= 0 && m < 16))) &&
    Number.isInteger(a.seed) && (a.input === 'stored' || a.input === 'chords') && a.latch === false &&
    (a.chords === undefined || validChords(a.chords) !== null) &&
    (a.chordKey === undefined || (Number.isInteger(a.chordKey) && a.chordKey >= 0 && a.chordKey < 12)) &&
    (a.chordOctave === undefined || (Number.isInteger(a.chordOctave) && a.chordOctave >= 0 && a.chordOctave <= 6)) &&
    (a.chordBars === undefined || (Number.isInteger(a.chordBars) && a.chordBars >= 1 && a.chordBars <= 4)) &&
    (a.chordLink === undefined || typeof a.chordLink === 'boolean') &&
    (a.followChords === undefined || validChords(a.followChords) !== null) &&
    (a.scale === undefined || SCALE_MODES.includes(a.scale)) && (a.scaleType === undefined || SCALE_TYPES.includes(a.scaleType)) &&
    (a.input !== 'chords' || Array.isArray(a.chords));
}

/** The progression fields that linked clips share; octave and rhythm stay per clip. */
const linkedFields = (a: ArpState) => ({ chords: a.chords.map(c => ({ ...c })), chordKey: a.chordKey, chordBars: clipChordBars(a) });
const linked = (clip: ClipDoc | null | undefined) => clip?.arp?.settings.input === 'chords' && !!clip.arp.settings.chordLink;
/** Linked chord-track clips in scene `s` other than track `t`. */
export function linkedClipTracks(session: SessionDoc, s: number, t: number): number[] {
  return (session.scenes[s]?.clips ?? []).flatMap((c, i) => i !== t && linked(c) ? [i] : []);
}
/** Applies scene-wide chord linking to an edited clip arp: a clip that has just
 *  joined adopts the scene's linked progression; an edit to a linked clip is
 *  copied to every other linked clip of the scene. */
export function linkChordWrites(session: SessionDoc, s: number, t: number, arp: ClipArp): { arp: ClipArp; others: { t: number; clip: ClipDoc }[] } {
  const before = session.scenes[s]?.clips[t];
  const self = { ...before!, arp };
  if (!linked(self)) return { arp, others: [] };
  const peers = linkedClipTracks(session, s, t);
  if (!peers.length) return { arp, others: [] };
  if (!linked(before)) {
    const source = session.scenes[s].clips[peers[0]]!.arp!.settings;
    return { arp: { ...arp, settings: { ...arp.settings, ...linkedFields(source) } }, others: [] };
  }
  const shared = linkedFields(arp.settings);
  return { arp, others: peers.map(i => {
    const clip = session.scenes[s].clips[i]!;
    return { t: i, clip: { ...clip, arp: { ...clip.arp!, settings: { ...clip.arp!.settings, ...shared } } } };
  }) };
}

/** A scene's chord progression: the chord track its linked clips share. */
export interface SceneChords { chords: ArpChord[]; key: number; bars: number }
/** Tracks whose clip in scene `s` follows the scene progression (a linked chord track). */
export function sceneChordTracks(session: SessionDoc, s: number): number[] {
  return (session.scenes[s]?.clips ?? []).flatMap((c, t) => linked(c) ? [t] : []);
}
/** The progression of scene `s`, or null when no clip links its chord track. */
export function sceneChords(session: SessionDoc, s: number): SceneChords | null {
  const t = sceneChordTracks(session, s)[0];
  if (t === undefined) return null;
  const a = session.scenes[s].clips[t]!.arp!.settings;
  return { chords: a.chords.map(c => ({ ...c })), key: a.chordKey, bars: clipChordBars(a) };
}
/** Clip writes that give every linked clip of scene `s` the progression `p`. */
export function sceneChordWrites(session: SessionDoc, s: number, p: SceneChords): { t: number; clip: ClipDoc }[] {
  return sceneChordTracks(session, s).map(t => {
    const clip = session.scenes[s].clips[t]!;
    return { t, clip: { ...clip, arp: { ...clip.arp!, settings: { ...clip.arp!.settings,
      chords: p.chords.map(c => ({ ...c })), chordKey: p.key, chordBars: p.bars } } } };
  });
}

/** A chord-track clip switched to FOLLOW: its notes keep their place against
 *  its current chords, and move when the scene loads another progression. */
export function followClip(clip: ClipDoc): ClipDoc {
  const a = clip.arp?.settings;
  if (!a || a.input !== 'chords') throw new Error(`${clip.name}: FOLLOW needs a chord track`);
  return { ...clip, arp: { ...clip.arp!, settings: { ...a, scale: 'follow', followChords: a.chords.map(c => ({ ...c })) } } };
}
