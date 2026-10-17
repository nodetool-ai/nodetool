// Plays a short run of pad hits through the store's pad-trigger path. A new run
// cancels the last one. Silent unless the engine is on and the caller allows it
// (standalone and idle, or SQ-4 with its transport stopped).

import { useRef } from 'react';
import { useDrumStore } from '../../store';

/** [delay in ms, pad, velocity] */
export type TimedHit = [number, number, number];

export function useDrumAudition() {
  const timers = useRef<number[]>([]);
  const stop = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  const play = (plan: (bpm: number) => TimedHit[], allowed: boolean) => {
    stop();
    const { powered, params, triggerPad } = useDrumStore.getState();
    if (!powered || !allowed) return;
    for (const [ms, padI, vel] of plan(params['seq.bpm'] || 120)) {
      timers.current.push(window.setTimeout(() => triggerPad(padI, vel), 30 + ms));
    }
  };
  return { play, stop };
}
