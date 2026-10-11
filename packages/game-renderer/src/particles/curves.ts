import type { GameParticleCurve, GameParticleGradient, GameParticleRange } from "@nodetool-ai/protocol";

import type { ParticleRandom } from "./random.js";

export interface ParticleColor {
  r: number;
  g: number;
  b: number;
}

/** Evaluates piecewise-linear keys at normalized age `t`, holding the end values outside the keyed span. */
export function evaluateParticleCurve(keys: GameParticleCurve, t: number): number {
  if (t <= keys[0].t) {
    return keys[0].value;
  }
  for (let index = 1; index < keys.length; index += 1) {
    const next = keys[index];
    if (t <= next.t) {
      const previous = keys[index - 1];
      const span = next.t - previous.t;
      return span <= 0 ? next.value : previous.value + ((next.value - previous.value) * (t - previous.t)) / span;
    }
  }
  return keys[keys.length - 1].value;
}

/** Parses `#rrggbb` into channels between 0 and 1. */
export function parseParticleColor(hex: string, out: ParticleColor = { r: 0, g: 0, b: 0 }): ParticleColor {
  const value = Number.parseInt(hex.slice(1), 16);
  out.r = ((value >> 16) & 0xff) / 255;
  out.g = ((value >> 8) & 0xff) / 255;
  out.b = (value & 0xff) / 255;
  return out;
}

/** Evaluates a colour gradient at normalized age `t` with the same rules as {@link evaluateParticleCurve}. */
export function evaluateParticleGradient(keys: GameParticleGradient, t: number, out: ParticleColor = { r: 0, g: 0, b: 0 }): ParticleColor {
  if (t <= keys[0].t) {
    return parseParticleColor(keys[0].color, out);
  }
  for (let index = 1; index < keys.length; index += 1) {
    const next = keys[index];
    if (t <= next.t) {
      const previous = keys[index - 1];
      const span = next.t - previous.t;
      const mix = span <= 0 ? 1 : (t - previous.t) / span;
      const from = parseParticleColor(previous.color);
      const to = parseParticleColor(next.color);
      out.r = from.r + (to.r - from.r) * mix;
      out.g = from.g + (to.g - from.g) * mix;
      out.b = from.b + (to.b - from.b) * mix;
      return out;
    }
  }
  return parseParticleColor(keys[keys.length - 1].color, out);
}

/** A fixed value, or a uniform sample between `min` and `max`. A fixed value consumes no random number. */
export function sampleParticleRange(range: GameParticleRange, random: ParticleRandom): number {
  return typeof range === "number" ? range : range.min + (range.max - range.min) * random.next();
}
