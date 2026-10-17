// Poly-aware rectangle verbs over hosted WT-1 clip bytes (8 voice lanes per
// step, bar-major — see protocol.ts). Same contract as the mono rect helpers
// in src/shared/seqEdit.ts: rect steps are absolute timeline steps
// (0 .. bars*16-1), only lit voices whose note lane falls inside the rect's
// pitch band are touched, and paste/move DROPS cells that land outside the
// clip or the lane range — never wraps or clamps. Unlike the mono grids a
// step can hold several captured voices (chords); paste re-allocates each
// into a free voice slot at the target step and drops voices that don't fit.

import { rectNorm, type RectCells, type RectSel } from '../shared/seqEdit';
import { STEPS_PER_BAR, WT_POLY_LANES, wtNoteIdx } from './protocol';

const NOTE_LANES = 12;
// A cleared voice slot, matching toggleChordNote's clear (duration bits stay
// zeroed; byte2 = neutral octave).
const EMPTY_VOICE: readonly number[] = [0, 0, 1];

const barStep = (absStep: number): [number, number] =>
  [Math.floor(absStep / STEPS_PER_BAR), absStep % STEPS_PER_BAR];

export function copyRectWt(bytes: Uint8Array, rect: RectSel): RectCells {
  const { stepLo, stepHi, noteLo, noteHi } = rectNorm(rect);
  const cells: RectCells['cells'] = [];
  for (let s = stepLo; s <= stepHi; s++) {
    const [bar, step] = barStep(s);
    for (let lane = 0; lane < WT_POLY_LANES; lane++) {
      const o = wtNoteIdx(bar, step, lane);
      if (o + 2 >= bytes.length) continue;
      const note = bytes[o + 1] & 0x7f;
      if ((bytes[o] & 1) !== 0 && note >= noteLo && note <= noteHi) {
        cells.push({ dStep: s - stepLo, bytes: bytes.slice(o, o + 3) });
      }
    }
  }
  return { wSteps: stepHi - stepLo + 1, noteLo, noteHi, cells };
}

export function clearRectWt(bytes: Uint8Array, rect: RectSel): Uint8Array {
  const { stepLo, stepHi, noteLo, noteHi } = rectNorm(rect);
  const next = bytes.slice();
  for (let s = stepLo; s <= stepHi; s++) {
    const [bar, step] = barStep(s);
    for (let lane = 0; lane < WT_POLY_LANES; lane++) {
      const o = wtNoteIdx(bar, step, lane);
      if (o + 2 >= next.length) continue;
      const note = next[o + 1] & 0x7f;
      if ((next[o] & 1) !== 0 && note >= noteLo && note <= noteHi) next.set(EMPTY_VOICE, o);
    }
  }
  return next;
}

export function pasteRectWt(
  bytes: Uint8Array, bars: number, atStep: number, dNote: number, data: RectCells,
): Uint8Array {
  const next = bytes.slice();
  for (const c of data.cells) {
    const s = atStep + c.dStep;
    if (s < 0 || s >= bars * STEPS_PER_BAR) continue;
    const note = (c.bytes[1] & 0x7f) + dNote;
    if (note < 0 || note >= NOTE_LANES) continue;
    const [bar, step] = barStep(s);
    // First free voice slot at the target step; a full chord drops the voice.
    let free = -1;
    for (let lane = 0; lane < WT_POLY_LANES; lane++) {
      if ((next[wtNoteIdx(bar, step, lane)] & 1) === 0) { free = lane; break; }
    }
    if (free < 0) continue;
    const o = wtNoteIdx(bar, step, free);
    next.set(c.bytes, o);
    next[o + 1] = note;
  }
  return next;
}

export function moveRectWt(
  bytes: Uint8Array, bars: number, rect: RectSel, dStep: number, dNote: number,
  opts: { copy?: boolean } = {},
): Uint8Array {
  const { stepLo } = rectNorm(rect);
  const data = copyRectWt(bytes, rect);
  const base = opts.copy ? bytes.slice() : clearRectWt(bytes, rect);
  return pasteRectWt(base, bars, stepLo + dStep, dNote, data);
}
