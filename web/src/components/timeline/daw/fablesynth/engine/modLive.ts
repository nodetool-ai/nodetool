// Live-modulation telemetry sink. The worklet streams {t:'mod', d} at ~23 Hz
// (see worklet.js); the values land HERE — a mutable singleton outside React
// state — and UI consumers read them from a single shared rAF loop, updating
// DOM/SVG attributes directly. 16 modulated knobs therefore cost zero React
// re-renders per telemetry frame.

import { MOD_DESTS, MOD_LOG_D, type ParamDef } from '../params';

export const modLive = {
  // sums[MOD_DESTS index] = the viz voice's live route sum x (bipolar, same
  // value the engine folds into the modulated param via the Lin/Log curve rule)
  sums: new Float32Array(MOD_DESTS.length),
  active: false,
  stamp: 0,
};

/** Engine callback (SynthEngine.onmod). d=null closes the stream. */
export function feedModLive(d: Float32Array | null): void {
  if (d) {
    modLive.sums.set(d);
    modLive.active = true;
    modLive.stamp = performance.now();
  } else {
    modLive.active = false;
  }
}

type Sub = () => void;
const subs = new Set<Sub>();
let raf = 0;

function tick(): void {
  // Stale guard: an audio stall (context suspend, tab freeze, power-off)
  // never gets a null terminator, so a silent feed must not freeze the dots.
  if (modLive.active && performance.now() - modLive.stamp > 300) modLive.active = false;
  subs.forEach((f) => f());
  raf = subs.size ? requestAnimationFrame(tick) : 0;
}

/** Run `f` every animation frame while subscribed. Returns the unsubscriber. */
export function subscribeModLive(f: Sub): () => void {
  subs.add(f);
  if (!raf) raf = requestAnimationFrame(tick);
  return () => {
    subs.delete(f);
    if (!subs.size && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };
}

// Normalized (0..1 knob-arc) offset a route sum x produces on `def`:
// Lin folds as p + x·(hi−lo) -> the norm offset IS x; Log folds as p·2^(x·D)
// -> x·D / log2(max/min) of the arc. Mirrors the worklet's curve rule.
export function modNormOffset(def: ParamDef, x: number): number {
  if (def.curve === 'log') return (x * MOD_LOG_D) / Math.log2((def.max as number) / (def.min as number));
  return x;
}
