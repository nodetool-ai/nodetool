"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export interface BeatSpan {
  readonly start_ms: number;
  readonly end_ms: number;
}

export interface BeatClock {
  readonly elapsedMs: number;
  readonly playing: boolean;
  readonly activeIndex: number;
  play: () => void;
  pause: () => void;
  seek: (ms: number) => void;
}

/** Plays a beat sheet in real time and reports which beat is on screen. */
export function useBeatClock(
  beats: readonly BeatSpan[],
  options: { readonly loop?: boolean; readonly initialMs?: number } = {}
): BeatClock {
  const durationMs = beats[beats.length - 1].end_ms;
  const { loop = false, initialMs = 0 } = options;
  const [elapsedMs, setElapsedMs] = useState(initialMs);
  const [playing, setPlaying] = useState(false);
  const elapsedRef = useRef(initialMs);

  useEffect(() => {
    if (!playing) {
      return;
    }
    let frame = 0;
    const origin = performance.now() - elapsedRef.current;
    const tick = (now: number): void => {
      let next = now - origin;
      if (next >= durationMs) {
        if (!loop) {
          elapsedRef.current = durationMs - 1;
          setElapsedMs(durationMs - 1);
          setPlaying(false);
          return;
        }
        next %= durationMs;
      }
      elapsedRef.current = next;
      setElapsedMs(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, durationMs, loop]);

  const seek = useCallback((ms: number) => {
    elapsedRef.current = ms;
    setElapsedMs(ms);
  }, []);

  const play = useCallback(() => {
    if (elapsedRef.current >= durationMs - 1) {
      elapsedRef.current = 0;
      setElapsedMs(0);
    }
    setPlaying(true);
  }, [durationMs]);

  const pause = useCallback(() => setPlaying(false), []);

  const found = beats.findIndex((beat) => elapsedMs < beat.end_ms);
  const activeIndex = found === -1 ? beats.length - 1 : found;
  return { elapsedMs, playing, activeIndex, play, pause, seek };
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent): void =>
      setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}
