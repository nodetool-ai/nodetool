import { validSequenceRhythm, type SequenceRhythm } from '../shared/sequenceRhythm';
// SQ-4 clip & session protocol — the single source of truth for the design
// in docs/sq4-clips.md: session document schema, clip payload layouts, the
// shared-timebase boundary math and the base64 codec used to embed pattern
// bytes in a session file. The three worklets implement the runtime side of
// this contract (host/tempo/clip/clipstop in, clipstart/clipstop/pos out).

import type { Quant } from './model';
import { validClipArp, type ClipArp } from './clipArp';
import { validateAutomation, type AutoLane } from './clipAutomation';
import type { MasterFxParams } from './masterFx';
import { validateDrumRhythm, type DrumRhythm } from '../drum/rhythm';

export type MachineId = 'DR1' | 'BL1' | 'WT1';

export const STEPS_PER_BAR = 16;
export const DR1_PADS = 16;
export const NOTE_STRIDE = 3; // flags, note, oct+1 per voice-step
/** Maximum simultaneous notes in a WT-1 SQ-4 step (matches the 8-voice engine). */
export const WT_POLY_LANES = 8;
export const MAX_BARS = 16;

// Clip payload layouts (must match each worklet's clipRead):
//   DR1: byte per pad-step, bar-major:  ((bar*16 + pad) * 16) + step
//   BL1: 3 bytes per step, bar-major
//   WT1: 8 poly lanes per step, step-major then lane-major
export const bytesPerBar = (m: MachineId): number =>
  m === 'DR1' ? DR1_PADS * STEPS_PER_BAR
    : STEPS_PER_BAR * NOTE_STRIDE * (m === 'WT1' ? WT_POLY_LANES : 1);

export const dr1Idx = (bar: number, pad: number, step: number): number =>
  (bar * DR1_PADS + pad) * STEPS_PER_BAR + step;

export const noteIdx = (bar: number, step: number): number =>
  (bar * STEPS_PER_BAR + step) * NOTE_STRIDE;

export const wtNoteIdx = (bar: number, step: number, lane = 0): number =>
  ((bar * STEPS_PER_BAR + step) * WT_POLY_LANES + lane) * NOTE_STRIDE;

/** Hosted editor edits at most this many bars (= device NPATTERNS). */
export const HOSTED_MAX_BARS = 4;

/** A silent clip payload; note machines get neutral octave and one-step duration. */
export function emptyClipBytes(machine: MachineId, bars: number): Uint8Array {
  const out = new Uint8Array(bars * bytesPerBar(machine));
  if (machine !== 'DR1') {
    for (let i = 0; i < out.length; i += NOTE_STRIDE) { out[i] = 1 << 2; out[i + 2] = 1; }
  }
  return out;
}

// ---------- session document ----------

export interface SessionDoc {
  v: 1;
  name: string;
  bpm: number; // 60..200, global — the conductor owns tempo
  swing: number; // 0..1, global
  quant: Quant;
  tracks: TrackDoc[];
  scenes: SceneDoc[];
  /** Optional for v1 compatibility; omitted sessions recall neutral master processing. */
  masterFx?: MasterFxParams;
  /** Optional master fader (0..1); omitted sessions recall the 0.75 default. */
  masterVol?: number;
}

export interface TrackDoc {
  machine: MachineId;
  name: string;
  color: string;
  gain: number; // 0..1 track fader
  patch: PatchDoc;
}

// v1 sessions use factory patches; 'inline' embeds a machine-native patch
// payload (DrumKit / BassPatch / Preset JSON) for portability later. `base`
// records the factory index the inline edits started from, so the UI can keep
// showing that patch's name (with a dirty marker) instead of falling back to
// CUSTOM. Absent when the patch has no factory origin (imported/raw).
export type PatchDoc =
  | { kind: 'factory'; index: number }
  | { kind: 'inline'; data: unknown; base?: number };

export interface SceneDoc {
  name: string;
  clips: (ClipDoc | null)[]; // one slot per track
  // Empty slots act as Ableton-style stop buttons on scene launch; tracks
  // listed here are pass-through instead (previous clip keeps playing).
  pass?: number[];
}

export interface ClipDoc {
  arp?: ClipArp;
  automation?: AutoLane[];
  drumRhythm?: DrumRhythm;
  sequenceRhythm?: SequenceRhythm; // Web melodic POLY prototype; native playback not implemented.
  name: string;
  bars: number; // 1..MAX_BARS
  pattern: string; // base64 of the machine's packed clip bytes
}

// ---------- base64 codec (no Buffer/btoa dependency: runs in node + browser) ----------

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INV: Record<string, number> = {};
for (let i = 0; i < 64; i++) B64_INV[B64[i]] = i;

export function bytesToB64(u8: Uint8Array): string {
  let out = '';
  for (let i = 0; i < u8.length; i += 3) {
    const a = u8[i], b = i + 1 < u8.length ? u8[i + 1] : 0, c = i + 2 < u8.length ? u8[i + 2] : 0;
    out += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < u8.length ? B64[((b & 15) << 2) | (c >> 6)] : '=';
    out += i + 2 < u8.length ? B64[c & 63] : '=';
  }
  return out;
}

export function b64ToBytes(s: string): Uint8Array {
  const clean = s.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = [0, 1, 2, 3].map((k) => B64_INV[clean[i + k]] ?? 0);
    const chunk = clean.length - i;
    out[o++] = (n[0] << 2) | (n[1] >> 4);
    if (chunk > 2 && o < out.length) out[o++] = ((n[1] & 15) << 4) | (n[2] >> 2);
    if (chunk > 3 && o < out.length) out[o++] = ((n[2] & 3) << 6) | n[3];
  }
  return out;
}

// ---------- boundary math (shared timebase, docs §3) ----------

export const samplesPerBeat = (bpm: number, sr: number): number => (sr * 60) / bpm;
export const samplesPerStep = (bpm: number, sr: number): number => samplesPerBeat(bpm, sr) / 4;
export const barFrames = (bpm: number, sr: number): number => samplesPerBeat(bpm, sr) * 4;

/**
 * Next quantize boundary at-or-after `now`, in context frames. Quant OFF
 * returns 0 — devices treat atFrame <= currentFrame as "this block".
 */
export function boundaryFrame(quant: Quant, now: number, anchor: number, bpm: number, sr: number): number {
  if (quant === 'OFF') return 0;
  const q = quant === '1 BAR' ? barFrames(bpm, sr) : samplesPerBeat(bpm, sr);
  const delta = Math.max(0, now - anchor);
  return anchor + Math.ceil(delta / q) * q;
}

/** Musical position of a context frame against the anchor (for the UI clock). */
export function songPosition(now: number, anchor: number, bpm: number, sr: number): { beat: number; bar: number } {
  const beats = Math.max(0, now - anchor) / samplesPerBeat(bpm, sr);
  return { beat: Math.floor(beats) % 4, bar: Math.floor(beats / 4) + 1 };
}

export const barSeconds = (bpm: number): number => 240 / bpm;

// ---------- validation + persistence ----------

/** Returns null when valid, else a human-readable reason. */
export function validateSession(doc: SessionDoc): string | null {
  if (doc.v !== 1) return `unknown session version ${String(doc.v)}`;
  if (!(doc.bpm >= 60 && doc.bpm <= 200)) return 'bpm out of range';
  if (!Array.isArray(doc.tracks) || !doc.tracks.length) return 'no tracks';
  if (!Array.isArray(doc.scenes)) return 'no scenes';
  if (doc.masterVol !== undefined && !(doc.masterVol >= 0 && doc.masterVol <= 1)) return 'masterVol out of range';
  for (let t = 0; t < doc.tracks.length; t++) {
    if (!['DR1', 'BL1', 'WT1'].includes(doc.tracks[t].machine)) return `track ${t}: unknown machine`;
  }
  for (let s = 0; s < doc.scenes.length; s++) {
    const sc = doc.scenes[s];
    if (sc.clips.length !== doc.tracks.length) return `scene ${s}: clip count != track count`;
    for (let t = 0; t < sc.clips.length; t++) {
      const c = sc.clips[t];
      if (!c) continue;
      if (c.arp !== undefined && (doc.tracks[t].machine === 'DR1' || !validClipArp(c.arp))) return `scene ${s} track ${t}: invalid arpeggiator`;
      if (c.sequenceRhythm !== undefined && (doc.tracks[t].machine === 'DR1' || !validSequenceRhythm(c.sequenceRhythm))) return `scene ${s} track ${t}: invalid melodic rhythm`;
      if (c.drumRhythm !== undefined) {
        if (doc.tracks[t].machine !== 'DR1') return `scene ${s} track ${t}: rhythm is only valid for DR1 clips`;
        const rhythmError = validateDrumRhythm(c.drumRhythm, c.bars);
        if (rhythmError) return `scene ${s} track ${t}: ${rhythmError}`;
      }
      if (c.automation !== undefined) {
        const autoError = validateAutomation(c.automation, doc.tracks[t].machine);
        if (autoError) return `scene ${s} track ${t}: ${autoError}`;
      }
      if (!(c.bars >= 1 && c.bars <= MAX_BARS)) return `scene ${s} track ${t}: bars out of range`;
      const bytes = b64ToBytes(c.pattern);
      const want = c.bars * bytesPerBar(doc.tracks[t].machine);
      if (bytes.length !== want) return `scene ${s} track ${t}: pattern is ${bytes.length} bytes, expected ${want}`;
    }
  }
  return null;
}

const LS_KEY = 'fable.session.v1';

export function loadSession(fallback: SessionDoc): SessionDoc {
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return fallback;
    const doc = JSON.parse(raw) as SessionDoc;
    return validateSession(doc) === null ? doc : fallback;
  } catch {
    return fallback;
  }
}

export function saveSession(doc: SessionDoc): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(LS_KEY, JSON.stringify(doc));
  } catch {
    /* quota / private mode */
  }
}
