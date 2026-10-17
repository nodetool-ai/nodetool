// The factory session: the SQ-4 mock's six scenes as real, playable clips.
// Patterns are handcrafted in each machine's packed clip layout (protocol.ts).
// DR-1 pad map (shared by 808, UZU, and hybrid kits): 0 KICK · 2 SNARE · 3 CLAP · 4 RIM · 5 CH HAT ·
// 6 OH HAT · 8..10 TOMS · 12/13 PERC.

import {
  bytesPerBar, bytesToB64, type ClipDoc, type MachineId, noteIdx, type SessionDoc, wtNoteIdx,
} from './protocol';
import { FACTORY_CLIP_LIBRARY } from './clipLibrary.gen';

// ---------- pattern builders ----------

interface NoteStep {
  s: number; // absolute step (0 .. bars*16-1)
  n: number; // lane 0..11
  o?: number; // octave -1/0/1
  a?: boolean; // accent
  d?: number; // duration in 16th-note steps
  sl?: boolean; // BL-1 legato slide into this note
  lane?: number; // WT-1 chord voice 0..2
}

function noteClip(machine: Extract<MachineId, 'BL1' | 'WT1'>, name: string, bars: number, steps: NoteStep[]): ClipDoc {
  const data = new Uint8Array(bars * bytesPerBar(machine));
  // Neutral octave plus a one-step duration for every note slot.
  for (let i = 0; i < data.length; i += 3) { data[i] = 1 << 2; data[i + 2] = 1; }
  for (const st of steps) {
    const o = machine === 'WT1'
      ? wtNoteIdx(Math.floor(st.s / 16), st.s % 16, st.lane ?? 0)
      : noteIdx(Math.floor(st.s / 16), st.s % 16);
    const duration = Math.min(63, bars * 16 - st.s, Math.max(1, st.d ?? 1));
    data[o] = 1 | (st.a ? 2 : 0) | (duration << 2);
    data[o + 1] = st.n | (machine === 'BL1' && st.sl ? 0x80 : 0);
    data[o + 2] = (st.o ?? 0) + 1;
  }
  return { name, bars, pattern: bytesToB64(data) };
}

const bassClip = (name: string, bars: number, steps: NoteStep[]) => noteClip('BL1', name, bars, steps);
const wtClip = (name: string, bars: number, steps: NoteStep[]) => noteClip('WT1', name, bars, steps);

/** A sustained note, split only at the packed format's 63-step limit. */
function held(s0: number, span: number, n: number, o = 0, lane = 0): NoteStep[] {
  const out: NoteStep[] = [];
  for (let s = s0, remaining = span; remaining > 0;) {
    const d = Math.min(remaining, 63);
    out.push({ s, n, o, lane, d });
    s += d;
    remaining -= d;
  }
  return out;
}

function chordHeld(s0: number, span: number, root: number, octave = 0, minor = true): NoteStep[] {
  const intervals = [0, minor ? 3 : 4, 7];
  return intervals.flatMap((interval, lane) => {
    const absolute = root + interval;
    return held(s0, span, absolute % 12, octave + Math.floor(absolute / 12), lane);
  });
}

// ---------- drum clips ----------

function factoryDrumClip(id: string): ClipDoc {
  const clip = FACTORY_CLIP_LIBRARY.find((entry) => entry.id === id && entry.machine === 'DR1');
  if (!clip) throw new Error(`Missing factory DR-1 clip ${id}`);
  return { name: clip.name, bars: clip.bars, pattern: clip.pattern };
}

const SPARSE_KICK = factoryDrumClip('dr1-distant-ticks');
const HAT_RISE = factoryDrumClip('dr1-hat-rise');
const FULL_KIT_A = factoryDrumClip('dr1-neon-drive');
const FULL_KIT_B = factoryDrumClip('dr1-jungle-sparks');
const TAIL_KICK = factoryDrumClip('dr1-ghost-shuffle');

// ---------- bass clips (BL-1 lanes: 0 = its C, slide bit glides) ----------

const ACID_CRAWL = bassClip('ACID CRAWL', 2, [
  { s: 0, n: 0 }, { s: 3, n: 0, sl: true }, { s: 8, n: 3 }, { s: 11, n: 0 },
  { s: 16, n: 0 }, { s: 19, n: 10, o: -1 }, { s: 24, n: 5 }, { s: 27, n: 3, sl: true },
]);

const ACID_303 = bassClip('ACID 303', 4, [
  { s: 0, n: 0, a: true }, { s: 2, n: 0 }, { s: 3, n: 0, o: 1, sl: true }, { s: 4, n: 0 },
  { s: 6, n: 3, a: true }, { s: 7, n: 5, sl: true }, { s: 8, n: 0 }, { s: 10, n: 10, o: -1 },
  { s: 11, n: 0, sl: true }, { s: 12, n: 7, a: true }, { s: 14, n: 5 }, { s: 15, n: 3, sl: true },
  { s: 16, n: 10, a: true }, { s: 18, n: 10 }, { s: 20, n: 5 }, { s: 22, n: 3, sl: true },
  { s: 24, n: 10 }, { s: 26, n: 0, o: 1 }, { s: 28, n: 7 }, { s: 30, n: 5, sl: true },
  { s: 32, n: 7, a: true }, { s: 34, n: 7 }, { s: 36, n: 2 }, { s: 38, n: 0, sl: true },
  { s: 40, n: 7 }, { s: 42, n: 10, o: -1 }, { s: 44, n: 5 }, { s: 46, n: 3, sl: true },
  { s: 48, n: 5, a: true }, { s: 50, n: 5 }, { s: 52, n: 0 }, { s: 54, n: 10, o: -1, sl: true },
  { s: 56, n: 5 }, { s: 58, n: 7 }, { s: 60, n: 3 }, { s: 62, n: 0, sl: true },
]);

const ACID_SHIFT = bassClip('ACID SHIFT', 4, [
  { s: 0, n: 3, a: true }, { s: 2, n: 3 }, { s: 4, n: 10, o: -1 }, { s: 5, n: 3, sl: true },
  { s: 7, n: 7 }, { s: 8, n: 3, a: true }, { s: 10, n: 5, sl: true }, { s: 12, n: 0 },
  { s: 13, n: 0, o: 1, sl: true }, { s: 15, n: 10, o: -1 },
  { s: 16, n: 0, a: true }, { s: 18, n: 0 }, { s: 20, n: 7 }, { s: 21, n: 0, sl: true },
  { s: 23, n: 10 }, { s: 24, n: 0, a: true }, { s: 26, n: 3, sl: true }, { s: 28, n: 5 },
  { s: 30, n: 7, o: -1 }, { s: 31, n: 10, sl: true },
  { s: 32, n: 10, a: true }, { s: 34, n: 10 }, { s: 36, n: 5 }, { s: 37, n: 10, sl: true },
  { s: 39, n: 3 }, { s: 40, n: 10, a: true }, { s: 42, n: 0, sl: true }, { s: 44, n: 3 },
  { s: 46, n: 5, o: -1 }, { s: 47, n: 7, sl: true },
  { s: 48, n: 7, a: true }, { s: 50, n: 7 }, { s: 52, n: 2 }, { s: 53, n: 7, sl: true },
  { s: 55, n: 0 }, { s: 56, n: 7, a: true }, { s: 58, n: 10, sl: true }, { s: 60, n: 0 },
  { s: 62, n: 3, o: -1 },
]);

const SUB_HOLD = bassClip('SUB HOLD', 4, [
  ...held(0, 16, 0, -1),
  ...held(16, 16, 10, -1),
  ...held(32, 16, 3, -1),
  ...held(48, 12, 5, -1), ...held(60, 4, 7, -1),
]);

// ---------- lead / pad clips (WT-1, lanes relative to seq.root C3) ----------

const GLASS_HOOK = wtClip('GLASS HOOK', 4, [
  { s: 0, n: 0, o: 1, a: true }, { s: 3, n: 10 }, { s: 6, n: 7 }, { s: 8, n: 3, o: 1 },
  { s: 10, n: 10 }, { s: 14, n: 5 },
  { s: 16, n: 0, o: 1, a: true }, { s: 19, n: 10 }, { s: 22, n: 7 }, { s: 24, n: 2, o: 1 },
  { s: 26, n: 0, o: 1 }, { s: 30, n: 7 },
  { s: 32, n: 7, o: 1, a: true }, { s: 35, n: 5, o: 1 }, { s: 38, n: 2, o: 1 }, { s: 40, n: 10 },
  { s: 42, n: 7, o: 1 }, { s: 46, n: 5 },
  { s: 48, n: 5, o: 1, a: true }, { s: 51, n: 3, o: 1 }, { s: 54, n: 0, o: 1 }, { s: 56, n: 10 },
  { s: 58, n: 7 }, { s: 62, n: 3, o: 1 },
]);

const GLASS_HOOK_II = wtClip('GLASS HOOK II', 4, [
  { s: 0, n: 3, o: 1, a: true }, { s: 3, n: 0, o: 1 }, { s: 6, n: 10 }, { s: 8, n: 5, o: 1 },
  { s: 10, n: 3, o: 1 }, { s: 14, n: 7 },
  { s: 16, n: 3, o: 1, a: true }, { s: 19, n: 2, o: 1 }, { s: 22, n: 0, o: 1 }, { s: 24, n: 10 },
  { s: 26, n: 7 }, { s: 30, n: 10 },
  { s: 32, n: 10, o: 1, a: true }, { s: 35, n: 7, o: 1 }, { s: 38, n: 5 }, { s: 40, n: 3, o: 1 },
  { s: 42, n: 2, o: 1 }, { s: 46, n: 0, o: 1 },
  { s: 48, n: 7, o: 1, a: true }, { s: 51, n: 5, o: 1 }, { s: 54, n: 3, o: 1 }, { s: 56, n: 0, o: 1 },
  { s: 58, n: 10 }, { s: 62, n: 7 },
]);

const GLASS_SOLO = wtClip('GLASS SOLO', 4, [
  { s: 0, n: 0, o: 1 }, { s: 4, n: 10 }, { s: 8, n: 7 }, { s: 12, n: 10 },
  { s: 16, n: 3, o: 1 }, { s: 20, n: 2, o: 1 }, { s: 24, n: 0, o: 1 }, { s: 28, n: 10 },
  { s: 32, n: 5, o: 1 }, { s: 36, n: 3, o: 1 }, { s: 40, n: 2, o: 1 }, { s: 44, n: 0, o: 1 },
  { s: 48, n: 10, a: true }, { s: 52, n: 7 }, { s: 56, n: 3 }, { s: 60, n: 0 },
]);

const AIR_BED = wtClip('AIR BED', 4, [
  ...chordHeld(0, 16, 0, 0, true),
  ...chordHeld(16, 16, 10, -1, false),
  ...chordHeld(32, 16, 8, -1, false),
  ...chordHeld(48, 16, 3, 0, true),
]);

const AIR_BED_II = wtClip('AIR BED II', 4, [
  ...chordHeld(0, 16, 3, 0, true),
  ...chordHeld(16, 16, 2, 0, true),
  ...chordHeld(32, 16, 0, 0, true),
  ...chordHeld(48, 16, 10, -1, false),
]);

const FOG_STABS = wtClip('FOG STABS', 4, [
  // Four roots establish a C–Bb–G–F progression for the chord patch,
  // close-voiced in the root octave (0..11): clear of the bass register below
  // while staying under the +12..+23 lead band.
  { s: 0, n: 0 }, { s: 2, n: 0 }, { s: 7, n: 3 }, { s: 10, n: 5, a: true }, { s: 12, n: 5 },
  { s: 16, n: 10 }, { s: 18, n: 10 }, { s: 23, n: 0 }, { s: 26, n: 2 }, { s: 28, n: 3 },
  { s: 32, n: 7 }, { s: 34, n: 7 }, { s: 39, n: 10 }, { s: 42, n: 2, a: true }, { s: 44, n: 2 },
  { s: 48, n: 5 }, { s: 50, n: 5 }, { s: 55, n: 0 }, { s: 58, n: 5 }, { s: 60, n: 0 },
].flatMap((step) => [step, { ...step, lane: 1, n: (step.n + 3) % 12 }, { ...step, lane: 2, n: (step.n + 7) % 12 }]));

/** A held chord close-voiced in the octave below the root: each tone at its pitch class − 12. */
function chordHeldLow(s0: number, span: number, root: number, minor = true): NoteStep[] {
  const intervals = [0, minor ? 3 : 4, 7];
  return intervals.flatMap((interval, lane) => held(s0, span, ((root + interval) % 12 + 12) % 12, -1, lane));
}

const FOG_SWELL = wtClip('FOG SWELL', 8, [
  ...chordHeldLow(0, 32, 0),
  ...chordHeldLow(32, 32, 10, false),
  ...chordHeldLow(64, 32, 5),
  ...chordHeldLow(96, 32, 3),
]);

const AIR_OUT = wtClip('AIR OUT', 8, [
  ...chordHeld(0, 32, 0),
  ...chordHeld(32, 32, 10, -1, false),
  ...chordHeld(64, 64, 0, -1),
]);

// ---------- the session ----------

export function factorySession(): SessionDoc {
  return {
    v: 1,
    name: 'NEON TALE',
    bpm: 122,
    swing: 0,
    quant: '1 BAR',
    tracks: [
      { machine: 'DR1', name: 'DRUMS', color: '#4de8ff', gain: 0.8, patch: { kind: 'factory', index: 13 } }, // 808+UZU HYBRID
      { machine: 'BL1', name: 'BASS', color: '#4dff9e', gain: 0.75, patch: { kind: 'factory', index: 0 } }, // ACID LINE
      { machine: 'WT1', name: 'LEAD', color: '#ffa14d', gain: 0.85, patch: { kind: 'factory', index: 3 } }, // CRYSTAL PLUCK
      { machine: 'WT1', name: 'PADS', color: '#b18cff', gain: 1, patch: { kind: 'factory', index: 11 } }, // FUTURE CHORD
    ],
    scenes: [
      { name: 'INTRO', clips: [SPARSE_KICK, null, null, AIR_BED] },
      { name: 'BUILD', clips: [HAT_RISE, ACID_CRAWL, null, AIR_BED_II] },
      { name: 'DROP A', clips: [FULL_KIT_A, ACID_303, GLASS_HOOK, FOG_STABS] },
      { name: 'DROP B', clips: [FULL_KIT_B, ACID_SHIFT, GLASS_HOOK_II, FOG_STABS] },
      { name: 'BREAK', clips: [null, SUB_HOLD, GLASS_SOLO, FOG_SWELL] },
      { name: 'OUTRO', clips: [TAIL_KICK, null, null, AIR_OUT] },
    ],
  };
}
