// Live-modulation telemetry sink. The worklet streams {t:'mod', d} at ~23 Hz
// (see worklet.js); the values land in a per-editor sink outside React state,
// and UI consumers read them from a single shared rAF loop, updating
// DOM/SVG attributes directly. 16 modulated knobs therefore cost zero React
// re-renders per telemetry frame.

import { MOD_DESTS, MOD_LOG_D, type ParamDef } from '../params';

export interface ModLive {
  // sums[MOD_DESTS index] = the viz voice's live route sum x (bipolar, same
  // value the engine folds into the modulated param via the Lin/Log curve rule)
  sums: Float32Array;
  active: boolean;
  stamp: number;
}

/** One sink per WT-1 editor: each follows its own track's device. */
export function createModLive(): ModLive {
  return { sums: new Float32Array(MOD_DESTS.length), active: false, stamp: 0 };
}

/** The device's `mod` message. d=null closes the stream. */
export function feedModLive(sink: ModLive, d: Float32Array | null): void {
  if (d) {
    sink.sums.set(d);
    sink.active = true;
    sink.stamp = performance.now();
  } else {
    sink.active = false;
  }
}

/**
 * True while the sink has fresh values. An audio stall (context suspend, tab
 * freeze, device gone) never sends a null terminator, so a silent feed must
 * not freeze the dots.
 */
export function modLiveActive(sink: ModLive): boolean {
  if (sink.active && performance.now() - sink.stamp > 300) sink.active = false;
  return sink.active;
}

type Sub = () => void;
const subs = new Set<Sub>();
let raf = 0;

function tick(): void {
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
