/**
 * Arpeggiator note pools and step rates, ported from FableSynth `src/arp.ts`.
 */

import type { ArpOrder } from "../types.js";

export const ARP_ORDERS: ArpOrder[] = ["up", "down", "updown", "played", "random"];

/** Step lengths in quarter notes, with their names, longest first. */
export const ARP_RATES: ReadonlyArray<readonly [number, string]> = [
  [1, "1/4"],
  [0.75, "1/8 DOTTED"],
  [0.5, "1/8"],
  [1 / 3, "1/8 TRIPLET"],
  [0.375, "1/16 DOTTED"],
  [0.25, "1/16"],
  [1 / 6, "1/16 TRIPLET"],
  [0.125, "1/32"]
];

/**
 * The notes an arp walks for `input`: deduplicated, sorted unless the order
 * is "played", spread over `octaves`, reversed for "down", and folded back
 * without repeating the ends for "updown".
 */
export function arpPool(order: ArpOrder, octaves: number, input: ReadonlyArray<number>): number[] {
  const base = [...new Set(input)].filter((n) => Number.isInteger(n) && n >= 0 && n <= 127);
  if (order !== "played") base.sort((x, y) => x - y);
  const pool = Array.from({ length: Math.max(1, octaves | 0) }, (_, oct) => base.map((n) => n + oct * 12))
    .flat()
    .filter((n) => n <= 127);
  if (order === "down") pool.reverse();
  if (order === "updown" && pool.length > 2) pool.push(...pool.slice(1, -1).reverse());
  return pool;
}

/** A deterministic 32-bit value for step `step` of seed `seed`. */
export function stepRandom(seed: number, step: number): number {
  let h = Math.imul((seed | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(step | 0, 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}
