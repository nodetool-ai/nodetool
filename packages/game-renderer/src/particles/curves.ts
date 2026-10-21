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

/** Channels of each gradient key, three per key. An emitter's gradient is evaluated per particle per frame, so it is parsed once. */
const gradientChannels = new WeakMap<GameParticleGradient, Float64Array>();

function channelsOf(keys: GameParticleGradient): Float64Array {
  let channels = gradientChannels.get(keys);
  if (!channels) {
    channels = new Float64Array(keys.length * 3);
    const color: ParticleColor = { r: 0, g: 0, b: 0 };
    for (const [index, key] of keys.entries()) {
      parseParticleColor(key.color, color);
      channels[index * 3] = color.r; channels[index * 3 + 1] = color.g; channels[index * 3 + 2] = color.b;
    }
    gradientChannels.set(keys, channels);
  }
  return channels;
}

/** Evaluates a colour gradient at normalized age `t` with the same rules as {@link evaluateParticleCurve}. */
export function evaluateParticleGradient(keys: GameParticleGradient, t: number, out: ParticleColor = { r: 0, g: 0, b: 0 }): ParticleColor {
  const channels = channelsOf(keys);
  let at = keys.length - 1;
  if (t <= keys[0].t) {
    at = 0;
  } else {
    for (let index = 1; index < keys.length; index += 1) {
      const next = keys[index];
      if (t <= next.t) {
        const previous = keys[index - 1];
        const span = next.t - previous.t;
        const mix = span <= 0 ? 1 : (t - previous.t) / span;
        const from = (index - 1) * 3;
        const to = index * 3;
        out.r = channels[from] + (channels[to] - channels[from]) * mix;
        out.g = channels[from + 1] + (channels[to + 1] - channels[from + 1]) * mix;
        out.b = channels[from + 2] + (channels[to + 2] - channels[from + 2]) * mix;
        return out;
      }
    }
  }
  out.r = channels[at * 3]; out.g = channels[at * 3 + 1]; out.b = channels[at * 3 + 2];
  return out;
}

/** A fixed value, or a uniform sample between `min` and `max`. A fixed value consumes no random number. */
export function sampleParticleRange(range: GameParticleRange, random: ParticleRandom): number {
  return typeof range === "number" ? range : range.min + (range.max - range.min) * random.next();
}
