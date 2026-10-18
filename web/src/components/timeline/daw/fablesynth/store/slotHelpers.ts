// Pure helpers over the 16 fixed modulation slot params (mat1..mat16). The store
// is now params-as-truth: a modulation route lives entirely in `mat{n}.src/.dst/
// .amt` rather than a separate dynamic list, so these functions read and write
// those params directly via a ParamValues map.
//
// Slot predicates (the single shared definitions — mirror the VST exactly):
//   findFreeSlot  -> first slot with src==0 AND dst==0 (fully empty, so a
//                    half-configured ADD-ROUTE row is never clobbered)
//   isSlotActive  -> src!=0 AND dst!=0 (the engine applies it; matrix marks it live)
//   rowVisible    -> src!=0 OR  dst!=0 (the matrix list shows the row)

import type { ParamValues } from '../params';

export const MOD_MATRIX_SIZE = 16;

// Default depth a drag-to-assign / ADD ROUTE gives a new route (real value).
export const MOD_DEFAULT_AMT = 0.3;

// One resolved modulation route, carrying its absolute slot number (1..16) so
// the UI can write straight back to that slot's params.
export interface ActiveRoute {
  slot: number; // 1..16
  src: number;
  dst: number;
  amt: number;
  pol: number; // MOD_POLARITY index
}

const srcOf = (p: ParamValues, n: number) => p[`mat${n}.src`] | 0;
const dstOf = (p: ParamValues, n: number) => p[`mat${n}.dst`] | 0;
const amtOf = (p: ParamValues, n: number) => p[`mat${n}.amt`] || 0;
const polOf = (p: ParamValues, n: number) => p[`mat${n}.pol`] | 0;

// First fully-empty slot (src==0 && dst==0), or 0 if the pool is full.
export function findFreeSlot(p: ParamValues): number {
  for (let n = 1; n <= MOD_MATRIX_SIZE; n++) {
    if (srcOf(p, n) === 0 && dstOf(p, n) === 0) return n;
  }
  return 0;
}

// Routes the engine acts on: both a source and a destination are set.
export function getActiveSlots(p: ParamValues): ActiveRoute[] {
  const out: ActiveRoute[] = [];
  for (let n = 1; n <= MOD_MATRIX_SIZE; n++) {
    const src = srcOf(p, n);
    const dst = dstOf(p, n);
    if (src !== 0 && dst !== 0) out.push({ slot: n, src, dst, amt: amtOf(p, n), pol: polOf(p, n) });
  }
  return out;
}

// Active routes pointing at one destination (used by the on-control mod rings).
export function getModsByDest(p: ParamValues, dest: number): ActiveRoute[] {
  return getActiveSlots(p).filter((r) => r.dst === dest);
}

// Write one slot's fields, leaving unspecified fields untouched.
export function setMatSlot(
  p: ParamValues,
  slot: number,
  patch: { src?: number; dst?: number; amt?: number; pol?: number; aux?: number },
): void {
  if (patch.src !== undefined) p[`mat${slot}.src`] = patch.src;
  if (patch.dst !== undefined) p[`mat${slot}.dst`] = patch.dst;
  if (patch.amt !== undefined) p[`mat${slot}.amt`] = patch.amt;
  if (patch.pol !== undefined) p[`mat${slot}.pol`] = patch.pol;
  if (patch.aux !== undefined) p[`mat${slot}.aux`] = patch.aux;
}

// Zero a slot's src, dst, amt, pol AND aux so it reads as fully empty again.
export function clearSlot(p: ParamValues, slot: number): void {
  p[`mat${slot}.src`] = 0;
  p[`mat${slot}.dst`] = 0;
  p[`mat${slot}.amt`] = 0;
  p[`mat${slot}.pol`] = 0;
  p[`mat${slot}.aux`] = 0;
}
