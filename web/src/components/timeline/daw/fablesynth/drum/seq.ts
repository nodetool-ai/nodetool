// Pure sequencer data model + timing math. The worklet re-implements the same
// math internally (self-contained); Task 4's parity test asserts the constants.

import { PAD_COUNT } from './params';

export const STEPS = 16;
export const NPATTERNS = 4;
export const ACCENT_VEL = 1.0;
export const PLAIN_VEL = 0.72;
// Swing: odd 16ths are delayed by swing * SWING_MAX of a step (1.0 → triplet feel).
export const SWING_MAX = 0.667;

export type Patterns = Uint8Array;

export const patIdx = (pat: number, padI: number, step: number): number =>
  pat * PAD_COUNT * STEPS + padI * STEPS + step;

export const makeEmptyPatterns = (): Patterns => new Uint8Array(NPATTERNS * PAD_COUNT * STEPS);
