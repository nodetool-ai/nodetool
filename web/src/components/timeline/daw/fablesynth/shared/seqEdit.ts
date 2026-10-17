// Pure sequence-editing helpers shared by WT-1, BL-1 and DR-1: range
// copy/paste/clear/shift and rectangle selection (step × note-lane) over the
// packed Uint8Array pattern buffers, plus whole-pattern block ops and a bounded
// undo/redo history. Everything is immutable — callers get fresh Uint8Arrays
// and route them through their store's _setPatterns chokepoint.
//
// A SeqLayout describes how (pattern, step) maps into the flat buffer:
//   offset = pat * patternSize + laneOffset + step * stride
// WT-1/BL-1: stride 3, 16 steps, patternSize 48, laneOffset 0.
// DR-1: a pad's row is a lane — stride 1, 16 steps, patternSize
// PAD_COUNT*16, laneOffset padIndex*16. Whole-pattern ops always move the
// full patternSize block (all pads for DR-1), ignoring laneOffset.

export interface SeqLayout {
  stride: number; // bytes per step
  stepsPerPattern: number;
  patternSize: number; // bytes per whole pattern block
  laneOffset?: number; // byte offset of the lane within a pattern (DR-1 pad rows)
}

export type Patterns = Uint8Array;

const stepOffset = (l: SeqLayout, pat: number, step: number): number =>
  pat * l.patternSize + (l.laneOffset ?? 0) + step * l.stride;

const clampStep = (l: SeqLayout, step: number): number =>
  Math.min(l.stepsPerPattern - 1, Math.max(0, step | 0));

// Normalize an inclusive [from, to] selection to lo <= hi, clamped in-pattern.
const normRange = (l: SeqLayout, from: number, to: number): [number, number] => {
  const a = clampStep(l, from);
  const b = clampStep(l, to);
  return a <= b ? [a, b] : [b, a];
};

// Bytes for the inclusive step range [from, to] of one pattern (lane).
export function copyRange(p: Patterns, l: SeqLayout, pat: number, from: number, to: number): Uint8Array {
  const [lo, hi] = normRange(l, from, to);
  return p.slice(stepOffset(l, pat, lo), stepOffset(l, pat, hi) + l.stride);
}

// Paste range bytes starting at step `at`; steps past the pattern end are
// dropped (clamped), never wrapped. A paste whose start is already past the
// end is dropped entirely (returns an unchanged copy) — it must never be
// pulled back into the pattern. Returns a new buffer.
export function pasteRange(p: Patterns, l: SeqLayout, pat: number, at: number, data: Uint8Array): Patterns {
  const next = p.slice();
  if (at >= l.stepsPerPattern) return next;
  const start = clampStep(l, at);
  const steps = Math.min((data.length / l.stride) | 0, l.stepsPerPattern - start);
  if (steps > 0) next.set(data.subarray(0, steps * l.stride), stepOffset(l, pat, start));
  return next;
}

// Clear the inclusive range [from, to]. `emptyStep` is the byte pattern of a
// cleared step (stride bytes) — WT-1/BL-1 pass [1<<2, 0, 1] (duration 1,
// neutral octave); DR-1's cleared step is all zeros (the default).
export function clearRange(
  p: Patterns, l: SeqLayout, pat: number, from: number, to: number, emptyStep?: Uint8Array,
): Patterns {
  const next = p.slice();
  const [lo, hi] = normRange(l, from, to);
  for (let s = lo; s <= hi; s++) {
    const o = stepOffset(l, pat, s);
    for (let b = 0; b < l.stride; b++) next[o + b] = emptyStep ? emptyStep[b] : 0;
  }
  return next;
}

// Drag-move (or Alt-drag copy) of the range [from, to] to start at `dest`.
// The source bytes are captured first so overlapping moves are safe; on a
// move the vacated source steps are cleared with `emptyStep`.
export function shiftRange(
  p: Patterns, l: SeqLayout, pat: number, from: number, to: number, dest: number,
  opts: { copy?: boolean; emptyStep?: Uint8Array } = {},
): Patterns {
  const [lo, hi] = normRange(l, from, to);
  const data = copyRange(p, l, pat, lo, hi);
  const next = opts.copy ? p.slice() : clearRange(p, l, pat, lo, hi, opts.emptyStep);
  return pasteRange(next, l, pat, dest, data);
}

// ---------- rectangle (step × note-lane) selection ----------
// WT-1/BL-1 note grids only: stride-3 steps where byte0 bit0 = on and
// byte1 bits0..6 = note lane (0..11; BL-1 keeps its slide flag in bit7,
// which rides along untouched). Verbs touch only lit cells whose lane falls
// inside the rect's pitch band; paste/move DROPS cells that land outside the
// pattern or the lane range — never wraps or clamps.

export interface RectSel { stepFrom: number; stepTo: number; noteFrom: number; noteTo: number }

export interface RectCells {
  wSteps: number; // width of the source rect in steps
  noteLo: number; // normalized source pitch band
  noteHi: number;
  cells: Array<{ dStep: number; bytes: Uint8Array }>; // stride bytes, dStep from source stepLo
}

export const rectNorm = (r: RectSel): { stepLo: number; stepHi: number; noteLo: number; noteHi: number } => ({
  stepLo: Math.min(r.stepFrom, r.stepTo),
  stepHi: Math.max(r.stepFrom, r.stepTo),
  noteLo: Math.min(r.noteFrom, r.noteTo),
  noteHi: Math.max(r.noteFrom, r.noteTo),
});

const cellOn = (p: Patterns, o: number): boolean => (p[o] & 1) !== 0;
const cellNote = (p: Patterns, o: number): number => p[o + 1] & 0x7f;

export function copyRect(p: Patterns, l: SeqLayout, pat: number, rect: RectSel): RectCells {
  const { stepLo, stepHi, noteLo, noteHi } = rectNorm(rect);
  const cells: RectCells['cells'] = [];
  for (let s = stepLo; s <= stepHi; s++) {
    const o = stepOffset(l, pat, s);
    const n = cellNote(p, o);
    if (cellOn(p, o) && n >= noteLo && n <= noteHi) cells.push({ dStep: s - stepLo, bytes: p.slice(o, o + l.stride) });
  }
  return { wSteps: stepHi - stepLo + 1, noteLo, noteHi, cells };
}

export function clearRect(p: Patterns, l: SeqLayout, pat: number, rect: RectSel, emptyStep?: Uint8Array): Patterns {
  const { stepLo, stepHi, noteLo, noteHi } = rectNorm(rect);
  const next = p.slice();
  for (let s = stepLo; s <= stepHi; s++) {
    const o = stepOffset(l, pat, s);
    const n = cellNote(next, o);
    if (cellOn(next, o) && n >= noteLo && n <= noteHi) {
      for (let b = 0; b < l.stride; b++) next[o + b] = emptyStep ? emptyStep[b] : 0;
    }
  }
  return next;
}

export function pasteRect(
  p: Patterns, l: SeqLayout, pat: number, atStep: number, dNote: number, data: RectCells, maxNote = 11,
): Patterns {
  const next = p.slice();
  for (const c of data.cells) {
    const s = atStep + c.dStep;
    if (s < 0 || s >= l.stepsPerPattern) continue;
    const note = (c.bytes[1] & 0x7f) + dNote;
    if (note < 0 || note > maxNote) continue;
    const o = stepOffset(l, pat, s);
    next.set(c.bytes, o);
    next[o + 1] = (c.bytes[1] & 0x80) | note;
  }
  return next;
}

export function moveRect(
  p: Patterns, l: SeqLayout, pat: number, rect: RectSel, dStep: number, dNote: number,
  opts: { copy?: boolean; emptyStep?: Uint8Array; maxNote?: number } = {},
): Patterns {
  const { stepLo } = rectNorm(rect);
  const data = copyRect(p, l, pat, rect);
  const base = opts.copy ? p.slice() : clearRect(p, l, pat, rect, opts.emptyStep);
  return pasteRect(base, l, pat, stepLo + dStep, dNote, data, opts.maxNote ?? 11);
}

// ---------- chain-aware rect ops (absolute timeline steps) ----------
// The same four verbs over the *visible timeline*: rect steps are absolute
// (0 .. chain.length*stepsPerPattern-1) and each bar b maps to pattern
// chain[b], so a selection may span bar boundaries. Assumes each pattern
// appears at most once in the chain (standalone chains are the identity
// [0..len-1]; movePattern swaps content, never the chain). Cells landing
// past the timeline end are dropped, never wrapped.

const chainOffset = (l: SeqLayout, chain: number[], absStep: number): number | null => {
  const bar = Math.floor(absStep / l.stepsPerPattern);
  if (absStep < 0 || bar >= chain.length) return null;
  return stepOffset(l, chain[bar], absStep % l.stepsPerPattern);
};

export function copyRectChain(p: Patterns, l: SeqLayout, chain: number[], rect: RectSel): RectCells {
  const { stepLo, stepHi, noteLo, noteHi } = rectNorm(rect);
  const cells: RectCells['cells'] = [];
  for (let s = stepLo; s <= stepHi; s++) {
    const o = chainOffset(l, chain, s);
    if (o === null) continue;
    const n = cellNote(p, o);
    if (cellOn(p, o) && n >= noteLo && n <= noteHi) cells.push({ dStep: s - stepLo, bytes: p.slice(o, o + l.stride) });
  }
  return { wSteps: stepHi - stepLo + 1, noteLo, noteHi, cells };
}

export function clearRectChain(p: Patterns, l: SeqLayout, chain: number[], rect: RectSel, emptyStep?: Uint8Array): Patterns {
  const { stepLo, stepHi, noteLo, noteHi } = rectNorm(rect);
  const next = p.slice();
  for (let s = stepLo; s <= stepHi; s++) {
    const o = chainOffset(l, chain, s);
    if (o === null) continue;
    const n = cellNote(next, o);
    if (cellOn(next, o) && n >= noteLo && n <= noteHi) {
      for (let b = 0; b < l.stride; b++) next[o + b] = emptyStep ? emptyStep[b] : 0;
    }
  }
  return next;
}

export function pasteRectChain(
  p: Patterns, l: SeqLayout, chain: number[], atStep: number, dNote: number, data: RectCells, maxNote = 11,
): Patterns {
  const next = p.slice();
  for (const c of data.cells) {
    const o = chainOffset(l, chain, atStep + c.dStep);
    if (o === null) continue;
    const note = (c.bytes[1] & 0x7f) + dNote;
    if (note < 0 || note > maxNote) continue;
    next.set(c.bytes, o);
    next[o + 1] = (c.bytes[1] & 0x80) | note;
  }
  return next;
}

export function moveRectChain(
  p: Patterns, l: SeqLayout, chain: number[], rect: RectSel, dStep: number, dNote: number,
  opts: { copy?: boolean; emptyStep?: Uint8Array; maxNote?: number } = {},
): Patterns {
  const { stepLo } = rectNorm(rect);
  const data = copyRectChain(p, l, chain, rect);
  const base = opts.copy ? p.slice() : clearRectChain(p, l, chain, rect, opts.emptyStep);
  return pasteRectChain(base, l, chain, stepLo + dStep, dNote, data, opts.maxNote ?? 11);
}

// ---------- pad-grid rectangle (step × pad-lane) selection ----------
// DR-1 only. Unlike the note-lane rect above, the *row* axis is the pad lane
// itself (offset = pat*patternSize + pad*stepsPerPattern*stride + step*stride),
// so a rectangle spans a step band × a pad band and the row shift is
// positional — moving up/down changes which pad plays, it does not transpose a
// stored value. Cells are the raw stride bytes; only lit cells (byte0 != 0,
// i.e. on/accent) are captured. Paste/move DROP cells landing outside the step
// range [0, stepsPerPattern) or the pad range [0, padCount) — never wrap.

export interface PadRectSel { stepFrom: number; stepTo: number; padFrom: number; padTo: number }

export interface PadRectCells {
  wSteps: number; // width of the source rect in steps
  wPads: number; // height of the source rect in pad lanes
  // stride bytes, dStep/dPad measured from the rect's top-left (stepLo, padLo)
  cells: Array<{ dStep: number; dPad: number; bytes: Uint8Array }>;
}

export const padRectNorm = (r: PadRectSel): { stepLo: number; stepHi: number; padLo: number; padHi: number } => ({
  stepLo: Math.min(r.stepFrom, r.stepTo),
  stepHi: Math.max(r.stepFrom, r.stepTo),
  padLo: Math.min(r.padFrom, r.padTo),
  padHi: Math.max(r.padFrom, r.padTo),
});

const padOffset = (l: SeqLayout, pat: number, pad: number, step: number): number =>
  pat * l.patternSize + pad * l.stepsPerPattern * l.stride + step * l.stride;

export function copyPadRect(p: Patterns, l: SeqLayout, pat: number, rect: PadRectSel): PadRectCells {
  const { stepLo, stepHi, padLo, padHi } = padRectNorm(rect);
  const cells: PadRectCells['cells'] = [];
  for (let pad = padLo; pad <= padHi; pad++) {
    for (let s = stepLo; s <= stepHi; s++) {
      if (s < 0 || s >= l.stepsPerPattern) continue; // a re-anchored rect may overhang
      const o = padOffset(l, pat, pad, s);
      if (p[o] !== 0) cells.push({ dStep: s - stepLo, dPad: pad - padLo, bytes: p.slice(o, o + l.stride) });
    }
  }
  return { wSteps: stepHi - stepLo + 1, wPads: padHi - padLo + 1, cells };
}

export function clearPadRect(p: Patterns, l: SeqLayout, pat: number, rect: PadRectSel): Patterns {
  const { stepLo, stepHi, padLo, padHi } = padRectNorm(rect);
  const next = p.slice();
  for (let pad = padLo; pad <= padHi; pad++) {
    for (let s = stepLo; s <= stepHi; s++) {
      if (s < 0 || s >= l.stepsPerPattern) continue;
      const o = padOffset(l, pat, pad, s);
      for (let b = 0; b < l.stride; b++) next[o + b] = 0;
    }
  }
  return next;
}

// Stamp captured cells with the rect's top-left at (atStep, atPad). Cells past
// the step or pad range are dropped, never wrapped/clamped.
export function pastePadRect(
  p: Patterns, l: SeqLayout, pat: number, atStep: number, atPad: number, data: PadRectCells, padCount: number,
): Patterns {
  const next = p.slice();
  for (const c of data.cells) {
    const s = atStep + c.dStep;
    const pad = atPad + c.dPad;
    if (s < 0 || s >= l.stepsPerPattern || pad < 0 || pad >= padCount) continue;
    next.set(c.bytes, padOffset(l, pat, pad, s));
  }
  return next;
}

// Drag-move (or Alt-drag copy) of the rect by (dStep, dPad). Source bytes are
// captured first so overlapping moves are safe; a plain move clears the rect
// before pasting.
export function movePadRect(
  p: Patterns, l: SeqLayout, pat: number, rect: PadRectSel, dStep: number, dPad: number, padCount: number,
  opts: { copy?: boolean } = {},
): Patterns {
  const { stepLo, padLo } = padRectNorm(rect);
  const data = copyPadRect(p, l, pat, rect);
  const base = opts.copy ? p.slice() : clearPadRect(p, l, pat, rect);
  return pastePadRect(base, l, pat, stepLo + dStep, padLo + dPad, data, padCount);
}

// Whole-pattern block ops — the full patternSize bytes (all pads for DR-1).
export function copyPattern(p: Patterns, l: SeqLayout, pat: number): Uint8Array {
  return p.slice(pat * l.patternSize, (pat + 1) * l.patternSize);
}

export function pastePattern(p: Patterns, l: SeqLayout, pat: number, data: Uint8Array): Patterns {
  const next = p.slice();
  next.set(data.subarray(0, l.patternSize), pat * l.patternSize);
  return next;
}

// ---------- history ----------
// Bounded snapshot stack for undo/redo. Verbs call push(before) with the
// pre-mutation state; undo(current)/redo(current) return the state to restore
// (or null) and shuffle `current` onto the opposite stack. Snapshots are
// whatever the caller stores (Uint8Array patterns, session docs, …) — the
// helper never mutates them.

export interface History<T> {
  push: (snapshot: T) => void;
  undo: (current: T) => T | null;
  redo: (current: T) => T | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
  clear: () => void;
}

export function makeHistory<T>(limit = 50): History<T> {
  let past: T[] = [];
  let future: T[] = [];
  return {
    push: (snapshot) => {
      past.push(snapshot);
      if (past.length > limit) past = past.slice(past.length - limit);
      future = [];
    },
    undo: (current) => {
      const prev = past.pop();
      if (prev === undefined) return null;
      future.push(current);
      return prev;
    },
    redo: (current) => {
      const nxt = future.pop();
      if (nxt === undefined) return null;
      past.push(current);
      return nxt;
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    clear: () => { past = []; future = []; },
  };
}
