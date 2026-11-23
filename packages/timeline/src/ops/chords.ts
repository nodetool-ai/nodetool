/**
 * The chord ops: write, clear, transpose and detect chords on a chord track,
 * make midi clips follow it, and bake notes into its chords. Pure document
 * edits, shared by every host through `applyTimelineOp`.
 */

import type { serializeClip, serializeTrack } from "./serialize.js";
import type {
  ApplyProgressionParams,
  ClearChordsParams,
  DetectChordsParams,
  FitNotesToChordsParams,
  SetChordsParams,
  SetClipHarmonyParams,
  TransposeChordsParams
} from "@nodetool-ai/protocol/api-schemas/timeline-tool-params.js";
import {
  ARP_ORDERS,
  barTicks,
  chordAtTick,
  chordChart,
  chordMask,
  chordScale,
  CHORD_QUALITIES,
  chordSymbol,
  clearChordRange,
  COMP_LIBRARY,
  chordsFromChromaWindows,
  detectChordsFromNotes,
  findProgression,
  harmonySummary,
  isHarmonyActive,
  keyScale,
  listProgressionInfo,
  parseChordChart,
  parseChordSymbol,
  parseKey,
  progressionId,
  PROGRESSIONS,
  remapNote,
  scaleMask,
  scaleRemap,
  sortChords,
  tonicPitchClass,
  mixWindowChroma,
  windowChroma,
  type ChromaWindow,
  type WindowChroma,
  type DetectNote
} from "../harmony/index.js";
import { transposeNotes } from "../midi/edit.js";
import { expandMidiLoop } from "../clipLoop.js";
import { sortNotes, visibleNotes } from "../midi/notes.js";
import { resolveTempo } from "../midi/tempo.js";
import { MIDI_PPQ, msToTicks, ticksToMs } from "../midi/ticks.js";
import { timeRemapAudioSegments } from "../timeRemap.js";
import type {
  ClipHarmony,
  TimelineChord,
  TimelineClip,
  TimelineTempo,
  TimelineTrack
} from "../types.js";
import type { TimelineOpContext, TimelineOpResult, TimelineOpState } from "./types.js";

/** What the chord ops use of the op scope. `OpScope` in apply.ts satisfies it. */
export interface ChordScope {
  readonly state: TimelineOpState;
  readonly tracks: TimelineTrack[];
  readonly clips: TimelineClip[];
  readonly ctx: TimelineOpContext;
  addTrack(type: TimelineTrack["type"], name?: string): TimelineTrack;
  resolveTrack(idOrName: string): TimelineTrack;
  resolveClip(target: string): TimelineClip;
  resolveMidiClip(target: string): TimelineClip;
  assertWritable(clips: readonly TimelineClip[], destinationTrackId?: string): void;
  touch(...ids: string[]): void;
  clipOut(clip: TimelineClip): ReturnType<typeof serializeClip>;
  trackOut(track: TimelineTrack): ReturnType<typeof serializeTrack>;
  validUnits(units: readonly { id: string; name: string }[], kind: string): string;
}

const MAX_LISTED = 12;

function tempoOf(scope: ChordScope): TimelineTempo {
  return resolveTempo(scope.state);
}

function beatTicks(tempo: TimelineTempo): number {
  return Math.round((MIDI_PPQ * 4) / tempo.timeSignature.beatUnit);
}

/** A chord id unused on the track. Ids stay the document's own: the host id minter has no chord kind. */
function chordIdMinter(existing: ReadonlyArray<TimelineChord>): () => string {
  const used = new Set(existing.map((c) => c.id));
  let n = 0;
  return () => {
    let id: string;
    do {
      id = `chord_${(++n).toString(36)}`;
    } while (used.has(id));
    used.add(id);
    return id;
  };
}

/** The chord track an op writes to. `create` adds one when the document has none. */
function resolveChordTrack(
  scope: ChordScope,
  trackId: string | undefined,
  create: boolean
): { track: TimelineTrack; created: boolean } {
  const chordTracks = scope.tracks.filter((t) => t.type === "chord");
  if (trackId !== undefined) {
    const track = scope.resolveTrack(trackId);
    if (track.type !== "chord") {
      throw new Error(
        `Track "${track.name}" is a ${track.type} track, not a chord track. ` +
          (chordTracks.length
            ? scope.validUnits(chordTracks, "chord track")
            : "The document has no chord track. Omit trackId and set_chords creates one.")
      );
    }
    scope.assertWritable([], track.id);
    return { track, created: false };
  }
  const first = chordTracks[0];
  if (first) {
    scope.assertWritable([], first.id);
    return { track: first, created: false };
  }
  if (!create) {
    throw new Error(
      "The document has no chord track. Write chords with set_chords or apply_progression, which create one."
    );
  }
  const track = scope.addTrack("chord", "Chords");
  track.chords = [];
  return { track, created: true };
}

/** The chord track a clip follows, read-only. */
function readChordTrack(scope: ChordScope, trackId: string | undefined): TimelineTrack | undefined {
  if (trackId !== undefined) {
    const track = scope.resolveTrack(trackId);
    if (track.type !== "chord") {
      const chordTracks = scope.tracks.filter((t) => t.type === "chord");
      throw new Error(
        `Track "${track.name}" is a ${track.type} track, not a chord track. ` +
          (chordTracks.length
            ? scope.validUnits(chordTracks, "chord track")
            : "The document has no chord track yet. Write one with set_chords.")
      );
    }
    return track;
  }
  return scope.tracks.find((t) => t.type === "chord");
}

function rangeTicks(
  tempo: TimelineTempo,
  startBar: number | undefined,
  endBar: number | undefined
): { from: number; to: number } {
  const bar = barTicks(tempo);
  const from = ((startBar ?? 1) - 1) * bar;
  const to = endBar === undefined ? Number.POSITIVE_INFINITY : endBar * bar;
  if (to <= from) {
    throw new Error(
      `endBar ${String(endBar)} comes before startBar ${String(startBar ?? 1)}. Bars count from 1 and both are included.`
    );
  }
  return { from, to };
}

/** The whole-track chart: bar 1 to the bar that holds the last chord. */
export function trackChordChart(tempo: TimelineTempo, chords: ReadonlyArray<TimelineChord>): string {
  if (chords.length === 0) return "";
  const end = Math.max(...chords.map((c) => c.startTick + c.durationTick));
  return chordChart(chords, 0, end, tempo);
}

/** "A minor", or undefined when the document has no key. */
export function keyLabel(tempo: TimelineTempo): string | undefined {
  return tempo.key ? `${tempo.key.tonic} ${tempo.key.mode}` : undefined;
}

export function signatureLabel(tempo: TimelineTempo): string {
  return `${tempo.timeSignature.beatsPerBar}/${tempo.timeSignature.beatUnit}`;
}

function chordsOut(chords: ReadonlyArray<TimelineChord>) {
  return sortChords(chords).map((c) => ({
    id: c.id,
    symbol: chordSymbol(c),
    startTick: c.startTick,
    durationTick: c.durationTick
  }));
}

function writeResult(
  scope: ChordScope,
  track: TimelineTrack,
  created: boolean,
  from: number,
  to: number,
  extra: TimelineOpResult = {}
): TimelineOpResult {
  const tempo = tempoOf(scope);
  const chords = track.chords ?? [];
  const bar = barTicks(tempo);
  return {
    ok: true,
    trackId: track.id,
    createdTrack: created,
    chart: trackChordChart(tempo, chords),
    chordCount: chords.length,
    written: { startBar: from / bar + 1, endBar: Math.max(from / bar + 1, Math.ceil(to / bar - 1e-9)) },
    ...extra
  };
}

/** Replaces `[from, to)` of the track with `incoming`. */
function writeRange(
  track: TimelineTrack,
  from: number,
  to: number,
  incoming: TimelineChord[],
  mint: () => string
): void {
  const cleared = clearChordRange(track.chords ?? [], from, to, mint);
  // The range is empty and `incoming` is disjoint inside it, so no chord needs placing.
  track.chords = sortChords([...cleared, ...incoming]);
}

export function runSetChords(scope: ChordScope, op: SetChordsParams): TimelineOpResult {
  const hasChart = op.chart !== undefined && op.chart.trim() !== "";
  if (hasChart === (op.chords !== undefined)) {
    throw new Error(
      'Send exactly one of `chart` (a bar string such as "| Am | F | C G |") or `chords` (a list such as [{"symbol":"Am","bars":1}]).'
    );
  }
  const tempo = tempoOf(scope);
  const { track, created } = resolveChordTrack(scope, op.trackId, true);
  const bar = barTicks(tempo);
  const from = ((op.startBar ?? 1) - 1) * bar;
  const mint = chordIdMinter(track.chords ?? []);
  let incoming: TimelineChord[];
  let to: number;
  if (hasChart) {
    const parsed = parseChordChart(op.chart!, from, tempo, mint);
    if (!parsed.ok) throw new Error(parsed.error);
    incoming = parsed.chords;
    to = from + parsed.bars * bar;
  } else {
    incoming = [];
    let at = from;
    (op.chords ?? []).forEach((item, i) => {
      const parsed = parseChordSymbol(item.symbol);
      if (!parsed.ok) throw new Error(`chords[${i}]: ${parsed.error}`);
      const len =
        item.bars === undefined && item.beats === undefined
          ? bar
          : Math.round((item.bars ?? 0) * bar + (item.beats ?? 0) * beatTicks(tempo));
      if (len <= 0) throw new Error(`chords[${i}] has no length. Give \`bars\` or \`beats\` above 0.`);
      incoming.push({
        id: mint(),
        startTick: at,
        durationTick: len,
        root: parsed.root,
        quality: parsed.quality,
        inversion: parsed.inversion
      });
      at += len;
    });
    if (incoming.length === 0) throw new Error("`chords` is empty. List at least one chord.");
    to = at;
  }
  writeRange(track, from, to, incoming, mint);
  return writeResult(scope, track, created, from, to);
}

export function runClearChords(scope: ChordScope, op: ClearChordsParams): TimelineOpResult {
  const tempo = tempoOf(scope);
  if (op.trackId === undefined && !scope.tracks.some((t) => t.type === "chord")) {
    return {
      ok: true,
      removedChordCount: 0,
      chordCount: 0,
      chart: "",
      note: "The document has no chord track, so there was nothing to clear. set_chords creates one."
    };
  }
  const { track } = resolveChordTrack(scope, op.trackId, false);
  const { from, to } = rangeTicks(tempo, op.startBar, op.endBar);
  const before = track.chords?.length ?? 0;
  track.chords = clearChordRange(track.chords ?? [], from, to, chordIdMinter(track.chords ?? []));
  return {
    ok: true,
    trackId: track.id,
    removedChordCount: Math.max(0, before - track.chords.length),
    chart: trackChordChart(tempo, track.chords),
    chordCount: track.chords.length
  };
}

export function runListProgressions(): TimelineOpResult {
  return {
    ok: true,
    progressions: listProgressionInfo(),
    hint:
      "Pass an id or a name to apply_progression. Numerals count from the key tonic, so a minor key wants a minor progression such as i-VI-III-VII."
  };
}

export function runApplyProgression(scope: ChordScope, op: ApplyProgressionParams): TimelineOpResult {
  const progression = findProgression(op.progression);
  if (!progression) {
    const ids = PROGRESSIONS.slice(0, MAX_LISTED).map(progressionId);
    throw new Error(
      `No progression matches "${op.progression}". Call list_progressions for all ${PROGRESSIONS.length}. ` +
        `Valid ids include ${ids.join(", ")}.`
    );
  }
  const tempo = tempoOf(scope);
  let tonic = 0;
  let mode: "major" | "minor" = "major";
  if (op.key !== undefined) {
    const key = parseKey(op.key);
    if (!key.ok) throw new Error(key.error);
    tonic = key.tonic;
    mode = key.mode;
  } else if (tempo.key) {
    tonic = tonicPitchClass(tempo.key.tonic) ?? 0;
    mode = tempo.key.mode;
  }
  const { track, created } = resolveChordTrack(scope, op.trackId, true);
  const bar = barTicks(tempo);
  const from = ((op.startBar ?? 1) - 1) * bar;
  const mint = chordIdMinter(track.chords ?? []);
  const incoming: TimelineChord[] = [];
  let at = from;
  for (let pass = 0; pass < (op.repeat ?? 1); pass++) {
    for (const [degree, quality, beats] of progression.steps) {
      const len = Math.round(op.barsPerChord !== undefined ? op.barsPerChord * bar : (beats / 4) * bar);
      if (len <= 0) {
        throw new Error(
          `barsPerChord ${String(op.barsPerChord)} is too short: a chord needs at least 1 tick. Use 0.25 (one beat in 4/4) or more.`
        );
      }
      incoming.push({
        id: mint(),
        startTick: at,
        durationTick: len,
        root: (((tonic + degree) % 12) + 12) % 12,
        quality,
        inversion: 0
      });
      at += len;
    }
  }
  writeRange(track, from, at, incoming, mint);
  // The tonic chord (degree 0) tells the mode of the progression. One with no tonic chord gets no note.
  const tonicStep = progression.steps.find((step) => step[0] === 0);
  const tonicMinor = tonicStep ? CHORD_QUALITIES[tonicStep[1]].iv[1] === 3 : undefined;
  const note =
    mode === "minor" && tonicMinor === false
      ? `"${progression.name}" has a major tonic chord, so its chords are built on the tonic as a major-key progression. For a minor sound pick one of the MINOR progressions.`
      : mode === "major" && tonicMinor === true
        ? `"${progression.name}" has a minor tonic chord, so its chords are built on the tonic as a minor-key progression.`
        : undefined;
  const extra: TimelineOpResult = { progression: progressionId(progression) };
  if (note) extra.note = note;
  return writeResult(scope, track, created, from, at, extra);
}

/** Whether a clip's harmony makes it play from the chord track. */
function followsChords(clip: TimelineClip): boolean {
  const h = clip.harmony;
  if (!isHarmonyActive(h)) return false;
  return (h.style !== "off" && h.input === "chords") || h.scale === "chords";
}

/** Document tick of content tick 0 of `clip`. */
function clipShift(clip: TimelineClip, tempo: TimelineTempo): number {
  return Math.round(msToTicks(clip.startMs - (clip.inPointMs ?? 0) - tempo.offsetMs, tempo.bpm));
}

export function runTransposeChords(scope: ChordScope, op: TransposeChordsParams): TimelineOpResult {
  const tempo = tempoOf(scope);
  const hasChordTrack = op.trackId !== undefined || scope.tracks.some((t) => t.type === "chord");
  if (!hasChordTrack && !op.includeNotes) {
    throw new Error(
      "The document has no chord track to transpose. Write chords with set_chords, or send includeNotes: true to move written notes."
    );
  }
  const track = hasChordTrack ? resolveChordTrack(scope, op.trackId, false).track : undefined;
  const { from, to } = rangeTicks(tempo, op.startBar, op.endBar);
  let moved = 0;
  if (track) {
    // A chord that crosses an edge splits there, so the notes and the chord move together.
    const mint = chordIdMinter(track.chords ?? []);
    let chords = sortChords(track.chords ?? []);
    for (const cut of [from, to]) {
      if (!Number.isFinite(cut)) continue;
      chords = chords.flatMap((c) => {
        const end = c.startTick + c.durationTick;
        return c.startTick < cut && end > cut
          ? [
              { ...c, durationTick: cut - c.startTick },
              { ...c, id: mint(), startTick: cut, durationTick: end - cut }
            ]
          : [c];
      });
    }
    track.chords = chords.map((c) => {
      if (c.startTick < from || c.startTick >= to) return c;
      moved++;
      return { ...c, root: (((c.root + op.semitones) % 12) + 12) % 12 };
    });
  }
  let noteCount = 0;
  const clipIds: string[] = [];
  if (op.includeNotes) {
    for (const clip of scope.clips) {
      if (clip.mediaType !== "midi" || !clip.notes?.length || followsChords(clip)) continue;
      const shift = clipShift(clip, tempo);
      const inRange = (startTick: number) => shift + startTick >= from && shift + startTick < to;
      // Only the notes in the clip's window sound, so only they move.
      const moving = visibleNotes(clip, tempo.bpm).filter((n) => inRange(n.startTick));
      if (moving.length === 0) continue;
      scope.assertWritable([clip]);
      const movedNotes = new Map(transposeNotes(moving, op.semitones).map((n) => [n.id, n]));
      noteCount += moving.length;
      clip.notes = clip.notes.map((n) => movedNotes.get(n.id) ?? n);
      clipIds.push(clip.id);
      scope.touch(clip.id);
    }
  }
  return {
    ok: true,
    trackId: track?.id ?? null,
    transposedChordCount: moved,
    transposedNoteCount: noteCount,
    noteClipIds: clipIds,
    chart: track ? trackChordChart(tempo, track.chords ?? []) : ""
  };
}

/** Shortest slice of a clip (ms) that counts as sound inside a window. */
const MIN_AUDIO_SLICE_MS = 50;

export async function runDetectChords(scope: ChordScope, op: DetectChordsParams): Promise<TimelineOpResult> {
  if (!op.clipIds?.length && !op.trackIds?.length) {
    throw new Error(
      "Say what to read: `clipIds` (midi or audio clips by id or name) or `trackIds` (every clip on those tracks)."
    );
  }
  const tempo = tempoOf(scope);
  const sources = new Map<string, TimelineClip>();
  const isAudio = (c: TimelineClip) => c.mediaType === "audio";
  for (const ref of op.clipIds ?? []) {
    const clip = scope.resolveClip(ref);
    if (clip.mediaType !== "midi" && !isAudio(clip)) {
      throw new Error(`Clip "${clip.name}" is a ${clip.mediaType} clip. Chords are read from midi and audio clips.`);
    }
    sources.set(clip.id, clip);
  }
  for (const ref of op.trackIds ?? []) {
    const track = scope.resolveTrack(ref);
    // A drum stem, a drum rack and a muted track have no harmony to read, so a track list leaves them out.
    if (track.muted || track.musicRole === "drums" || track.instrument?.type === "drum") continue;
    for (const clip of scope.clips) {
      if (clip.trackId !== track.id || clip.muted) continue;
      if (clip.mediaType === "midi" || isAudio(clip)) sources.set(clip.id, clip);
    }
  }
  if (sources.size === 0) {
    throw new Error(
      "No midi or audio clips to read. Pass clips in `clipIds`, or tracks that hold them in `trackIds` (drum tracks are skipped)."
    );
  }
  const audioClips = [...sources.values()].filter(isAudio);
  if (audioClips.length > 0 && audioClips.length < sources.size) {
    throw new Error("Read midi clips and audio clips in separate calls. Their weights do not mix.");
  }
  const notes: DetectNote[] = [];
  let firstTick = Number.POSITIVE_INFINITY;
  let lastTick = 0;
  let lastClipEnd = 0;
  for (const clip of sources.values()) {
    const shift = clipShift(clip, tempo);
    const clipEnd = Math.round(msToTicks(clip.startMs + clip.durationMs - tempo.offsetMs, tempo.bpm));
    if (isAudio(clip)) {
      firstTick = Math.min(firstTick, Math.round(msToTicks(clip.startMs - tempo.offsetMs, tempo.bpm)));
      lastTick = Math.max(lastTick, clipEnd);
      lastClipEnd = Math.max(lastClipEnd, clipEnd);
      continue;
    }
    for (const n of visibleNotes(expandMidiLoop(clip, tempo.bpm, tempo.offsetMs), tempo.bpm)) {
      // Playback gates a note at the clip end, so detection does too.
      const start = shift + n.startTick;
      const end = Math.min(start + n.durationTick, clipEnd);
      if (end <= start) continue;
      notes.push({ pitch: n.pitch, startTick: start, durationTick: end - start, muted: n.muted });
      if (!n.muted) {
        firstTick = Math.min(firstTick, start);
        lastTick = Math.max(lastTick, end);
      }
    }
    lastClipEnd = Math.max(lastClipEnd, clipEnd);
  }
  // The default end is the bar that holds the last note, not the end of a long clip window.
  if (lastTick === 0) lastTick = lastClipEnd;
  const bar = barTicks(tempo);
  // Without startBar the range starts at the bar of the first sounding note, so chords before the source stay.
  // A source that starts before bar 1 (a count-in) still reads from bar 1: chord ticks are never negative.
  const startBar = op.startBar ?? (Number.isFinite(firstTick) ? Math.max(1, Math.floor(firstTick / bar + 1e-6) + 1) : 1);
  const from = (startBar - 1) * bar;
  const to = op.endBar !== undefined ? op.endBar * bar : Math.max(from + bar, Math.ceil(lastTick / bar - 1e-6) * bar);
  if (to <= from) {
    throw new Error(`endBar ${String(op.endBar)} comes before startBar ${String(startBar)}.`);
  }
  const resolution = op.resolution ?? "bar";
  const step = resolution === "bar" ? bar : resolution === "half" ? Math.round(bar / 2) : beatTicks(tempo);
  const windows: Array<{ startTick: number; endTick: number }> = [];
  for (let at = from; at < to; at += step) windows.push({ startTick: at, endTick: Math.min(at + step, to) });

  const detected =
    audioClips.length > 0
      ? await detectFromAudioClips(scope, audioClips, windows, tempo)
      : detectChordsFromNotes(notes, windows, (i) => `detected_${i}`);
  const write = op.write ?? true;
  const baseOf = (chords: TimelineChord[]): TimelineOpResult => ({
    ok: true,
    written: false,
    resolution,
    range: { startBar, endBar: to / bar },
    chart: chordChart(chords, from, to, tempo),
    chordCount: chords.length,
    chords: chordsOut(chords)
  });
  if (detected.length === 0) {
    return {
      ...baseOf(detected),
      message:
        audioClips.length > 0
          ? "No sound in the range, so no chords were found and the chord track is unchanged."
          : "No sounding notes in the range, so no chords were found and the chord track is unchanged."
    };
  }
  if (!write) return baseOf(detected);
  const { track, created } = resolveChordTrack(scope, op.chordTrackId, true);
  const mint = chordIdMinter(track.chords ?? []);
  const incoming = detected.map((c) => ({ ...c, id: mint() }));
  writeRange(track, from, to, incoming, mint);
  // Return the chords as written, with the ids they have on the track.
  return { ...baseOf(incoming), written: true, trackId: track.id, createdTrack: created };
}

/** The source spans (ms) a clip plays under the timeline span [a, b]. Reverse and freeze stretches have no sound. */
function sourcePieces(clip: TimelineClip, a: number, b: number): Array<[number, number]> {
  const pieces: Array<[number, number]> = [];
  for (const seg of timeRemapAudioSegments(clip)) {
    if (seg.reverse) continue;
    const ta = Math.max(a, seg.timelineStartMs);
    const tb = Math.min(b, seg.timelineEndMs);
    if (tb <= ta) continue;
    pieces.push([
      seg.sourceStartMs + (ta - seg.timelineStartMs) * seg.rate,
      seg.sourceStartMs + (tb - seg.timelineStartMs) * seg.rate
    ]);
  }
  return pieces;
}

/** Hands the thread back, so a long analysis does not freeze a browser tab. */
const yieldThread = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const SLICE_BUDGET_MS = 12;

/**
 * Chords of audio clips. The host decodes the source audio each window needs.
 * A window reads the source spans the clip plays under it (in-point, speed and
 * time remap, forward stretches only), so the analysis follows the clip's own
 * timing. The source is read at its own pitch, whatever the playback speed.
 * Clips of one asset share one decode of the union of their spans.
 */
async function detectFromAudioClips(
  scope: ChordScope,
  clips: readonly TimelineClip[],
  windows: ReadonlyArray<{ startTick: number; endTick: number }>,
  tempo: TimelineTempo
): Promise<TimelineChord[]> {
  const decode = scope.ctx.decodeClipAudio;
  if (!decode) {
    throw new Error("This host cannot decode audio, so it cannot detect chords from an audio clip. Detect from a midi clip, or write the chords with set_chords.");
  }
  const toMs = (tick: number) => ticksToMs(tick, tempo.bpm) + tempo.offsetMs;
  // Plan: the source spans of every window and clip, and the range each asset needs.
  const plan = windows.map((w) => {
    const ws = toMs(w.startTick);
    const we = toMs(w.endTick);
    return clips.map((clip) => {
      const a = Math.max(ws, clip.startMs);
      const b = Math.min(we, clip.startMs + clip.durationMs);
      return b - a < MIN_AUDIO_SLICE_MS ? [] : sourcePieces(clip, a, b);
    });
  });
  const assetKey = (clip: TimelineClip) => clip.currentAssetId ?? clip.id;
  const ranges = new Map<string, { startMs: number; endMs: number; clip: TimelineClip }>();
  clips.forEach((clip, ci) => {
    for (const row of plan) {
      for (const [lo, hi] of row[ci]) {
        const key = assetKey(clip);
        const r = ranges.get(key);
        if (!r) ranges.set(key, { startMs: lo, endMs: hi, clip });
        else {
          r.startMs = Math.min(r.startMs, lo);
          r.endMs = Math.max(r.endMs, hi);
        }
      }
    }
  });
  const decoded = new Map<string, { samples: Float32Array; sampleRate: number; startMs: number }>();
  for (const [key, r] of ranges) {
    const range = { startMs: Math.max(0, r.startMs - 20), endMs: r.endMs + 20 };
    const audio = await decode(r.clip, range);
    if (!audio || audio.samples.length === 0) {
      throw new Error(`Could not read the audio of clip "${r.clip.name}". Check that the clip has an audio source.`);
    }
    decoded.set(key, { samples: audio.samples, sampleRate: audio.sampleRate, startMs: audio.startMs ?? 0 });
  }
  const chroma: ChromaWindow[] = [];
  let sliceStart = Date.now();
  for (let wi = 0; wi < windows.length; wi++) {
    const w = windows[wi];
    const heard: WindowChroma[] = [];
    clips.forEach((clip, ci) => {
      const audio = decoded.get(assetKey(clip));
      const pieces = plan[wi][ci];
      if (!audio || pieces.length === 0) return;
      const sr = audio.sampleRate;
      const spans = pieces.map(([lo, hi]) => [
        Math.round(((lo - audio.startMs) * sr) / 1000),
        Math.round(((hi - audio.startMs) * sr) / 1000)
      ]);
      let c: WindowChroma | null;
      if (spans.length === 1) {
        c = windowChroma(audio.samples, sr, spans[0][0], spans[0][1]);
      } else {
        // A remapped window plays several stretches. Join them in playing order.
        const parts = spans.map(([from, to]) => audio.samples.subarray(Math.max(0, from), Math.min(audio.samples.length, Math.max(from, to))));
        const joined = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
        let at = 0;
        for (const part of parts) {
          joined.set(part, at);
          at += part.length;
        }
        c = windowChroma(joined, sr, 0, joined.length);
      }
      if (c) heard.push(c);
    });
    chroma.push({ startTick: w.startTick, endTick: w.endTick, chroma: mixWindowChroma(heard) });
    if (Date.now() - sliceStart > SLICE_BUDGET_MS) {
      await yieldThread();
      sliceStart = Date.now();
    }
  }
  return chordsFromChromaWindows(chroma, (i) => `detected_${i}`);
}

function suggestPresets(text: string): string[] {
  const t = text.toLowerCase();
  return COMP_LIBRARY.filter((e) => e.name.toLowerCase().includes(t) || e.family.toLowerCase().includes(t))
    .slice(0, MAX_LISTED)
    .map((e) => e.name);
}

export function runSetClipHarmony(scope: ChordScope, op: SetClipHarmonyParams): TimelineOpResult {
  const clip = scope.resolveMidiClip(op.clipId);
  scope.assertWritable([clip]);
  const next: ClipHarmony = { ...(clip.harmony ?? { style: "off", input: "chords" }) };
  if (op.preset !== undefined) {
    const lower = op.preset.trim().toLowerCase();
    const entry = COMP_LIBRARY.find((e) => e.name.toLowerCase() === lower);
    if (!entry) {
      const close = suggestPresets(op.preset);
      const families = [...new Set(COMP_LIBRARY.map((e) => e.family))];
      throw new Error(
        `No comp preset named "${op.preset}". Call list_harmony_presets for all ${COMP_LIBRARY.length} names. ` +
          (close.length
            ? `Close names: ${close.join(", ")}.`
            : `Families: ${families.join(", ")}. Examples: ${COMP_LIBRARY.slice(0, 5).map((e) => e.name).join(", ")}.`)
      );
    }
    next.comp = [...entry.comp];
    next.ties = [...entry.ties];
    next.accents = [...entry.accents];
    next.rate = entry.rate;
    next.gate = entry.gate;
    next.strumMs = entry.strum;
    next.strumDirection = entry.strumDir;
    next.voicing = entry.voicing;
    if (op.style === undefined) {
      next.style = "comp";
      next.input = "chords";
    }
  }
  if (op.style !== undefined) {
    next.style = op.style;
    if (op.style !== "off") next.input = "chords";
  }
  if (op.order !== undefined) next.order = op.order;
  if (op.scale !== undefined) next.scale = op.scale;
  if (op.octave !== undefined) next.octave = op.octave;
  if (op.chordTrackId !== undefined) {
    const track = readChordTrack(scope, op.chordTrackId);
    if (track) next.chordTrackId = track.id;
  }
  clip.harmony = next;
  scope.touch(clip.id);
  const hasChords = scope.tracks.some((t) => t.type === "chord" && (t.chords?.length ?? 0) > 0);
  const result: TimelineOpResult = {
    ok: true,
    clip: scope.clipOut(clip),
    harmony: harmonySummary(next) ?? "off"
  };
  if (!hasChords && followsChords(clip)) {
    result.note =
      "The document has no chords yet, so the clip plays nothing until you write some with set_chords or apply_progression.";
  }
  return result;
}

export function runListHarmonyPresets(): TimelineOpResult {
  const families = new Map<string, string[]>();
  for (const e of COMP_LIBRARY) {
    const list = families.get(e.family) ?? [];
    list.push(e.name);
    families.set(e.family, list);
  }
  return {
    ok: true,
    compPresets: [...families].map(([family, names]) => ({ family, names })),
    arpOrders: [...ARP_ORDERS],
    styles: ["off", "arp", "comp"],
    scales: ["off", "key", "chords"],
    hint: "Pass a comp name as `preset` and an arp order as `order` to set_clip_harmony."
  };
}

export function runFitNotesToChords(scope: ChordScope, op: FitNotesToChordsParams): TimelineOpResult {
  const tempo = tempoOf(scope);
  const track = readChordTrack(scope, op.chordTrackId);
  const chords = sortChords(track?.chords ?? []);
  const mode = op.mode ?? "scale";
  const clips = op.clipIds.map((ref) => scope.resolveMidiClip(ref));
  if (chords.length === 0) {
    return {
      ok: true,
      mode,
      movedNoteCount: 0,
      clips: [],
      note: "There are no chords to fit to, so no note moved. Write chords with set_chords or apply_progression, then call this again."
    };
  }
  const key = tempo.key ? (tonicPitchClass(tempo.key.tonic) ?? chords[0].root) : chords[0].root;
  // The document key names its mode. Only a document with no key infers one from the chords.
  const keyMask = scaleMask(key, tempo.key ? tempo.key.mode : keyScale(chords, key));
  const tables = new Map<string, number[]>();
  const tableFor = (c: TimelineChord): number[] => {
    const id = `${c.root}|${c.quality}`;
    let t = tables.get(id);
    if (!t) {
      t = mode === "scale" ? scaleRemap(scaleMask(c.root, chordScale(c, keyMask))) : scaleRemap(chordMask(c));
      tables.set(id, t);
    }
    return t;
  };
  scope.assertWritable(clips);
  let total = 0;
  const perClip: Array<{ clipId: string; movedNoteCount: number }> = [];
  for (const clip of clips) {
    const shift = clipShift(clip, tempo);
    let moved = 0;
    // Notes outside the clip's window never sound, so they stay as they are.
    const visible = new Set(visibleNotes(clip, tempo.bpm).map((n) => n.id));
    // A clip transposes at playback (CE6). The fit reads the pitch that is
    // heard and stores the pitch the transpose lifts to it.
    const transpose = Math.round(clip.transpose ?? 0);
    const fitted = (clip.notes ?? []).map((n) => {
      if (!visible.has(n.id)) return n;
      const c = chordAtTick(chords, shift + n.startTick + 1e-6);
      if (!c) return n;
      const heard = Math.min(127, Math.max(0, n.pitch + transpose));
      const fittedPitch = remapNote(tableFor(c), heard);
      if (fittedPitch === heard) return n;
      moved++;
      return { ...n, pitch: Math.min(127, Math.max(0, fittedPitch - transpose)) };
    });
    clip.notes = sortNotes(fitted);
    total += moved;
    perClip.push({ clipId: clip.id, movedNoteCount: moved });
    scope.touch(clip.id);
  }
  return { ok: true, mode, movedNoteCount: total, clips: perClip };
}

