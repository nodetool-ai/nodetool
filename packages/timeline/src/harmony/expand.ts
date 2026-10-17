/**
 * The notes a midi clip with `harmony` actually plays.
 *
 * Arp and comp steps sit on the document beat grid from `tempo.offsetMs`
 * (step k starts at document tick k * rate * MIDI_PPQ), so clips on different
 * tracks stay in step with each other and with the chord track. The 16-entry
 * lanes repeat every 16 steps of that grid. An arpeggio restarts its pattern
 * on every chord change; a comp tie holds the previous voicing until the
 * chord changes. Everything here is pure and deterministic: RANDOM order
 * draws from a hash of the seed and the step index.
 *
 * Every renderer (preview, browser export, server export) calls
 * `applyClipHarmony` before it reads `clip.notes`, so they all hear the same
 * expansion.
 */

import { MIDI_PPQ, msToTicks } from "../midi/ticks.js";
import { resolveTempo } from "../midi/tempo.js";
import { sortNotes } from "../midi/notes.js";
import type {
  ClipHarmony,
  MidiNote,
  TimelineChord,
  TimelineClip,
  TimelineTempo,
  TimelineTrack
} from "../types.js";
import { arpPool, stepRandom } from "./arp.js";
import { chordAtTick, chordNotes, sortChords } from "./chords.js";
import { compVoices, parseCompSteps, spreadVoicing, strumDown } from "./comp.js";
import { chordMask, chordScale, keyScale, remapNote, scaleMask, scaleRemap } from "./scales.js";

/** Velocity of an accented step and of a plain one (FableSynth: 1.0 and 0.72). */
export const HARMONY_ACCENT_VELOCITY = 127;
export const HARMONY_PLAIN_VELOCITY = 91;

export type ResolvedClipHarmony = Required<Omit<ClipHarmony, "chordTrackId" | "scaleKey">> &
  Pick<ClipHarmony, "chordTrackId" | "scaleKey">;

/** FableSynth's fresh arp: 1/16 up over one octave, accents on the beat. */
export const DEFAULT_CLIP_HARMONY: ResolvedClipHarmony = {
  style: "arp",
  input: "chords",
  octave: 3,
  order: "up",
  rate: 0.25,
  octaves: 1,
  gate: 0.65,
  hits: Array.from({ length: 16 }, () => true),
  accents: Array.from({ length: 16 }, (_, i) => i % 4 === 0),
  seed: 1,
  comp: parseCompSteps("BC . . . C . . . C . . . C . . .").comp,
  ties: Array.from({ length: 16 }, () => false),
  strumMs: 0,
  strumDirection: "up",
  voicing: "close",
  scale: "off",
  scaleType: "auto"
};

const lane = <T>(v: ReadonlyArray<T> | undefined, fallback: ReadonlyArray<T>): T[] =>
  Array.from({ length: 16 }, (_, i) => (v && i < v.length ? v[i] : fallback[i]));

/** `harmony` with every absent field defaulted and every lane 16 long. */
export function resolveClipHarmony(harmony: ClipHarmony): ResolvedClipHarmony {
  const d = DEFAULT_CLIP_HARMONY;
  return {
    ...d,
    ...harmony,
    rate: harmony.rate && harmony.rate > 0 ? harmony.rate : d.rate,
    octaves: Math.max(1, Math.min(3, Math.round(harmony.octaves ?? d.octaves))),
    gate: Math.max(0.05, Math.min(0.95, harmony.gate ?? d.gate)),
    hits: lane(harmony.hits, d.hits),
    accents: lane(harmony.accents, d.accents),
    comp: lane(harmony.comp, d.comp),
    ties: lane(harmony.ties, d.ties)
  };
}

/** Whether `harmony` changes what the clip plays. */
export function isHarmonyActive(harmony: ClipHarmony | undefined): harmony is ClipHarmony {
  return !!harmony && (harmony.style !== "off" || (harmony.scale ?? "off") !== "off");
}

/** What expansion reads from the document. */
export interface HarmonyDocument {
  tracks: ReadonlyArray<Pick<TimelineTrack, "id" | "type" | "chords">>;
  tempo?: TimelineTempo;
}

/** The chord track a clip follows: `chordTrackId`, else the first chord track. */
export function chordTrackFor(
  harmony: Pick<ClipHarmony, "chordTrackId"> | undefined,
  tracks: HarmonyDocument["tracks"]
): Pick<TimelineTrack, "id" | "type" | "chords"> | undefined {
  const chordTracks = tracks.filter((t) => t.type === "chord");
  return (
    (harmony?.chordTrackId && chordTracks.find((t) => t.id === harmony.chordTrackId)) ||
    chordTracks[0]
  );
}

/** The key root a clip's scale uses: `scaleKey`, else the first chord's root, else C. */
export function harmonyKey(
  harmony: Pick<ClipHarmony, "scaleKey">,
  chords: ReadonlyArray<TimelineChord>
): number {
  return harmony.scaleKey ?? sortChords(chords)[0]?.root ?? 0;
}

type ClipGeometry = Pick<TimelineClip, "startMs" | "durationMs" | "inPointMs">;

/** Where a clip's content sits on the document tick grid, and its window in content ticks. */
function clipTicks(clip: ClipGeometry, tempo: TimelineTempo) {
  const inPoint = clip.inPointMs ?? 0;
  return {
    /** Document tick of content tick 0. */
    shift: msToTicks(clip.startMs - inPoint - tempo.offsetMs, tempo.bpm),
    winStart: msToTicks(inPoint, tempo.bpm),
    winEnd: msToTicks(inPoint + clip.durationMs, tempo.bpm)
  };
}

/** Written notes moved into the KEY scale, or each chord's CHORDS scale. */
export function snapNotesToScale(
  notes: ReadonlyArray<MidiNote>,
  harmony: ResolvedClipHarmony,
  chords: ReadonlyArray<TimelineChord>,
  shift: number
): MidiNote[] {
  if (harmony.scale === "off") return [...notes];
  const key = harmonyKey(harmony, chords);
  const keyId = harmony.scaleType === "auto" ? keyScale(chords, key) : harmony.scaleType;
  const keyMask = scaleMask(key, keyId);
  const keyTable = scaleRemap(keyMask, 1 << key);
  const tables = new Map<TimelineChord, number[]>();
  const tableAt = (tick: number): number[] => {
    if (harmony.scale !== "chords") return keyTable;
    const c = chordAtTick(chords, tick);
    if (!c) return keyTable;
    let t = tables.get(c);
    if (!t) {
      t = scaleRemap(scaleMask(c.root, chordScale(c, keyMask)), chordMask(c));
      tables.set(c, t);
    }
    return t;
  };
  return notes.map((n) => {
    const pitch = remapNote(tableAt(shift + n.startTick + 1e-6), n.pitch);
    return pitch === n.pitch ? n : { ...n, pitch };
  });
}

/** One step's source: the notes it plays from, and the bass note under them. */
interface StepSource {
  key: string;
  notes: number[];
  bass: number;
}

const EPS = 1e-6;
/** How far back a run or tie is traced before the clip's first step. */
const LOOKBACK_STEPS = 64;

/**
 * The notes `clip` plays, in content ticks, sorted. A clip without active
 * harmony plays its written notes unchanged.
 */
export function expandClipHarmony(
  clip: Pick<TimelineClip, "id" | "notes" | "harmony"> & ClipGeometry,
  doc: HarmonyDocument
): MidiNote[] {
  const written = clip.notes ?? [];
  if (!isHarmonyActive(clip.harmony)) return written;
  const h = resolveClipHarmony(clip.harmony);
  const tempo = resolveTempo(doc);
  const chords = sortChords(chordTrackFor(h, doc.tracks)?.chords ?? []);
  const { shift, winStart, winEnd } = clipTicks(clip, tempo);
  const snapped = snapNotesToScale(written, h, chords, shift);
  if (h.style === "off") return sortNotes(snapped);

  const stepTicks = h.rate * MIDI_PPQ;
  const base = (h.octave + 1) * 12;
  const kFirst = Math.ceil((shift + winStart) / stepTicks - EPS);
  const kLast = Math.ceil((shift + winEnd) / stepTicks - EPS) - 1;
  if (kLast < kFirst) return [];

  const heldOrder =
    h.order === "played"
      ? (a: MidiNote, b: MidiNote) => a.startTick - b.startTick || a.pitch - b.pitch
      : (a: MidiNote, b: MidiNote) => a.pitch - b.pitch;
  const sources = new Map<number, StepSource | null>();
  const sourceAt = (k: number): StepSource | null => {
    const cached = sources.get(k);
    if (cached !== undefined) return cached;
    const tick = k * stepTicks + EPS;
    let src: StepSource | null = null;
    if (h.input === "chords") {
      const c = chordAtTick(chords, tick);
      if (c) {
        src = {
          key: `${c.id}|${c.startTick}|${c.root}|${c.quality}|${c.inversion}`,
          notes: chordNotes(c, base),
          bass: base - 12 + c.root
        };
      }
    } else {
      const held = snapped
        .filter((n) => tick >= shift + n.startTick && tick < shift + n.startTick + n.durationTick)
        .sort(heldOrder);
      if (held.length) {
        const pitches = held.map((n) => n.pitch);
        const low = Math.min(...pitches);
        src = { key: pitches.join(","), notes: pitches, bass: low - 12 };
      }
    }
    sources.set(k, src);
    return src;
  };

  const lanePos = (k: number): number => ((k % 16) + 16) % 16;
  // `+ 0` turns -0 into 0.
  const contentTick = (docTick: number): number => Math.round(docTick - shift) + 0;
  const out: MidiNote[] = [];
  const push = (k: number, i: number, pitch: number, docStart: number, docLen: number, accent: boolean): void => {
    if (pitch < 0 || pitch > 127) return;
    const startTick = contentTick(docStart);
    out.push({
      id: `${clip.id}:h${k}:${i}`,
      pitch,
      velocity: accent ? HARMONY_ACCENT_VELOCITY : HARMONY_PLAIN_VELOCITY,
      startTick,
      durationTick: Math.max(1, contentTick(docStart + docLen) - startTick)
    });
  };

  if (h.style === "arp") {
    for (let k = kFirst; k <= kLast; k++) {
      const src = sourceAt(k);
      if (!src) continue;
      // The pattern restarts where this source began.
      let runStart = k;
      while (runStart > k - LOOKBACK_STEPS && sourceAt(runStart - 1)?.key === src.key) runStart--;
      const r = lanePos(k);
      if (!h.hits[r]) continue;
      const pool = arpPool(h.order, h.octaves, src.notes);
      if (!pool.length) continue;
      const idx = h.order === "random" ? (stepRandom(h.seed, k) >>> 8) % pool.length : (k - runStart) % pool.length;
      push(k, 0, pool[idx], k * stepTicks, stepTicks * h.gate, h.accents[r]);
    }
    return sortNotes(out);
  }

  // Comp: walk from before the window so ties and held voicings carry in,
  // then past it so a struck voicing knows how many tied steps it holds.
  const sixteenths = h.comp.some((m, r) => m && !h.ties[r] && r % 2 === 1);
  const strumTicks = msToTicks(h.strumMs, tempo.bpm);
  type Strike = { k: number; notes: number[]; accent: boolean; len: number };
  let held = 0;
  let open: Strike | null = null;
  const strikes: Strike[] = [];
  const kEnd = kLast + LOOKBACK_STEPS;
  for (let k = kFirst - LOOKBACK_STEPS; k <= kEnd; k++) {
    const r = lanePos(k);
    const src = sourceAt(k);
    const changed = src?.key !== sourceAt(k - 1)?.key;
    if (!src) {
      held = 0;
      open = null;
      if (k > kLast) break;
      continue;
    }
    const mask = h.ties[r] ? held : h.comp[r];
    if (h.ties[r] && held && !changed) {
      if (open) open.len++;
      continue;
    }
    open = null;
    if (k > kLast) break;
    held = mask;
    if (!mask) continue;
    const notes = compVoices(mask, spreadVoicing(src.notes, h.voicing), src.bass);
    if (strumDown(h.strumDirection, r, sixteenths)) notes.reverse();
    open = { k, notes, accent: h.accents[r], len: 1 };
    if (k >= kFirst) strikes.push(open);
  }
  for (const s of strikes) {
    const off = (s.len - 1 + h.gate) * stepTicks;
    const n = s.notes.length;
    const gap = n > 1 ? Math.min(strumTicks, (off * 0.5) / (n - 1)) : 0;
    s.notes.forEach((pitch, i) => {
      push(s.k, i, pitch, s.k * stepTicks + i * gap, off - i * gap, s.accent);
    });
  }
  return sortNotes(out);
}

const cache = new WeakMap<
  object,
  { chords: unknown; tracks: unknown; bpm: number; offsetMs: number; clip: TimelineClip }
>();

/**
 * `clip` with `notes` replaced by what it plays. Returned by reference when
 * the clip has no active harmony. Results are memoised per clip object and
 * chord list, so calling this on every playback tick is cheap.
 */
export function applyClipHarmony<C extends TimelineClip>(clip: C, doc: HarmonyDocument): C {
  if (!isHarmonyActive(clip.harmony)) return clip;
  const tempo = resolveTempo(doc);
  const track = chordTrackFor(clip.harmony, doc.tracks);
  const hit = cache.get(clip);
  if (
    hit &&
    hit.chords === track?.chords &&
    hit.tracks === track &&
    hit.bpm === tempo.bpm &&
    hit.offsetMs === tempo.offsetMs
  ) {
    return hit.clip as C;
  }
  const next = { ...clip, notes: expandClipHarmony(clip, doc) };
  cache.set(clip, { chords: track?.chords, tracks: track, bpm: tempo.bpm, offsetMs: tempo.offsetMs, clip: next });
  return next;
}

/** `applyClipHarmony` over a clip list. */
export function harmonizeClips<C extends TimelineClip>(clips: ReadonlyArray<C>, doc: HarmonyDocument): C[] {
  return clips.map((c) => applyClipHarmony(c, doc));
}
