/**
 * StabilizerBuffer — shared stroke stabiliser used by all drawing engines.
 *
 * Implements a weighted rolling-window average. The effective window size uses
 * a cubic ease-out curve so higher slider values ramp up more aggressively
 * (0 = no smoothing, 1 = maximum smoothing).
 *
 * Usage:
 *   const stab = new StabilizerBuffer();
 *   stab.reset();                        // call at beginStroke()
 *   const pt = stab.apply(raw, 0.6);    // call inside stabilize()
 */

import type { Point } from "../types";

const WINDOW_MAX = 20;

export class StabilizerBuffer {
  private buffer: Point[] = [];

  /** Reset per-stroke state. */
  reset(): void {
    this.buffer = [];
  }

  /**
   * Smooth `raw` according to `strength` (0–1).
   * Returns `raw` unchanged when `strength <= 0`.
   */
  apply(raw: Point, strength: number): Point {
    if (strength <= 0) {
      return raw;
    }
    const easedStrength = 1 - Math.pow(1 - strength, 3);
    const windowSize = Math.max(2, Math.round(easedStrength * WINDOW_MAX));
    this.buffer.push(raw);
    if (this.buffer.length > windowSize) {
      this.buffer.shift();
    }
    if (this.buffer.length === 1) {
      return raw;
    }
    let sx = 0;
    let sy = 0;
    for (const p of this.buffer) {
      sx += p.x;
      sy += p.y;
    }
    return { x: sx / this.buffer.length, y: sy / this.buffer.length };
  }
}
