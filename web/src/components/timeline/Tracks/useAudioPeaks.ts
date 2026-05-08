/**
 * useAudioPeaks
 *
 * Fetches and decodes an audio asset, then reduces channel 0 to a
 * fixed-resolution `Float32Array` of abs-max peaks suitable for drawing
 * waveform thumbnails on timeline clips.
 *
 * The decode is expensive, so results are cached at module level keyed
 * by URL — every clip referencing the same audio asset gets the same
 * peaks array. A single AudioContext is reused (created in suspended
 * state, no user gesture required for decodeAudioData).
 */
import { useEffect, useState } from "react";

import { computePeaks } from "./audioPeaks";

/** Resolution of the cached full-asset peaks array. */
const FULL_ASSET_PEAK_COUNT = 2000;

interface PeaksResult {
  peaks: Float32Array;
  durationMs: number;
}

const peaksCache = new Map<string, PeaksResult>();
const inFlight = new Map<string, Promise<PeaksResult | null>>();

let sharedCtx: AudioContext | null = null;

function getDecodeContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedCtx) {
    sharedCtx = new Ctor();
  }
  return sharedCtx;
}

async function loadPeaks(url: string): Promise<PeaksResult | null> {
  const cached = peaksCache.get(url);
  if (cached) return cached;
  const pending = inFlight.get(url);
  if (pending) return pending;

  const ctx = getDecodeContext();
  if (!ctx) return null;

  const promise = (async () => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} fetching audio: ${url}`);
      }
      const buffer = await response.arrayBuffer();
      const audio = await ctx.decodeAudioData(buffer);
      const channel = audio.getChannelData(0);
      const result: PeaksResult = {
        peaks: computePeaks(channel, FULL_ASSET_PEAK_COUNT),
        durationMs: audio.duration * 1000
      };
      peaksCache.set(url, result);
      return result;
    } catch (error) {
      console.warn("Failed to load audio peaks:", error);
      return null;
    } finally {
      inFlight.delete(url);
    }
  })();
  inFlight.set(url, promise);
  return promise;
}

export interface UseAudioPeaksResult {
  peaks: Float32Array | null;
  durationMs: number | null;
}

export function useAudioPeaks(url: string | undefined): UseAudioPeaksResult {
  const [state, setState] = useState<UseAudioPeaksResult>(() => {
    if (!url) return { peaks: null, durationMs: null };
    const cached = peaksCache.get(url);
    return cached
      ? { peaks: cached.peaks, durationMs: cached.durationMs }
      : { peaks: null, durationMs: null };
  });

  useEffect(() => {
    if (!url) {
      setState({ peaks: null, durationMs: null });
      return;
    }
    const cached = peaksCache.get(url);
    if (cached) {
      setState({ peaks: cached.peaks, durationMs: cached.durationMs });
      return;
    }
    let cancelled = false;
    void loadPeaks(url).then((result) => {
      if (cancelled || !result) return;
      setState({ peaks: result.peaks, durationMs: result.durationMs });
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return state;
}

/** Test helper — clears the module-level cache between specs. */
export function __resetAudioPeaksCacheForTests(): void {
  peaksCache.clear();
  inFlight.clear();
}
