/**
 * useAudioPeaks
 *
 * Loads the waveform peaks of an audio asset: a fixed-resolution
 * `Float32Array` of channel-0 abs-max values for drawing waveform thumbnails
 * on timeline clips, plus the decoded length of the audio.
 *
 * The server computes the peaks with ffmpeg and caches them on disk
 * (`GET /api/assets/:id/peaks`), so the browser never fetches or decodes the
 * audio file itself. Results are also cached here at module level, keyed by
 * the asset's media URL: every clip on the same asset shares one array, and a
 * file referenced in place carries its mtime in that URL, so a relinked file
 * gets new peaks.
 */
import { useEffect, useState } from "react";

import { restFetch } from "../../../lib/rest-fetch";
import { isFiniteNumber, isObjectLike } from "../../../utils/typePredicates";

/** Resolution of the cached full-asset peaks array. */
export const FULL_ASSET_PEAK_COUNT = 2000;

interface PeaksResult {
  peaks: Float32Array;
  durationMs: number;
}

const peaksCache = new Map<string, PeaksResult>();
const inFlight = new Map<string, Promise<PeaksResult | null>>();

/** Test seam: forget every loaded waveform. */
export function resetAudioPeaksCache(): void {
  peaksCache.clear();
  inFlight.clear();
}

function parsePeaks(body: unknown): PeaksResult | null {
  if (!isObjectLike(body)) return null;
  const peaks = body["peaks"];
  const durationMs = body["duration_ms"];
  if (!Array.isArray(peaks) || !isFiniteNumber(durationMs)) return null;
  return { peaks: Float32Array.from(peaks as number[]), durationMs };
}

async function loadPeaks(
  assetId: string,
  cacheKey: string
): Promise<PeaksResult | null> {
  const cached = peaksCache.get(cacheKey);
  if (cached) return cached;
  const pending = inFlight.get(cacheKey);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const response = await restFetch(
        `/api/assets/${encodeURIComponent(assetId)}/peaks?count=${FULL_ASSET_PEAK_COUNT}`
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} loading peaks for ${assetId}`);
      }
      const result = parsePeaks(await response.json());
      if (!result) {
        throw new Error(`Malformed peaks response for ${assetId}`);
      }
      peaksCache.set(cacheKey, result);
      return result;
    } catch (error) {
      console.warn("Failed to load audio peaks:", error);
      return null;
    } finally {
      inFlight.delete(cacheKey);
    }
  })();
  inFlight.set(cacheKey, promise);
  return promise;
}

interface UseAudioPeaksResult {
  peaks: Float32Array | null;
  durationMs: number | null;
}

const EMPTY: UseAudioPeaksResult = { peaks: null, durationMs: null };

/**
 * Peaks for `assetId`. `mediaUrl` is the asset's media URL from
 * `getAssetMediaUrl`: it keys the cache (it changes when the file does) and
 * nothing is loaded until it is known.
 */
export function useAudioPeaks(
  assetId: string | undefined,
  mediaUrl: string | undefined
): UseAudioPeaksResult {
  const [state, setState] = useState<UseAudioPeaksResult>(() => {
    const cached = mediaUrl ? peaksCache.get(mediaUrl) : undefined;
    return cached ?? EMPTY;
  });

  useEffect(() => {
    if (!assetId || !mediaUrl) {
      setState(EMPTY);
      return;
    }
    const cached = peaksCache.get(mediaUrl);
    if (cached) {
      setState(cached);
      return;
    }
    let cancelled = false;
    void loadPeaks(assetId, mediaUrl).then((result) => {
      if (cancelled || !result) return;
      setState(result);
    });
    return () => {
      cancelled = true;
    };
  }, [assetId, mediaUrl]);

  return state;
}
