/**
 * Poster frame for a stored video, with a client-side fallback.
 *
 * The server mints `thumb_url` for every video asset from a deterministic
 * storage key, without checking that the object exists. Generating that
 * object needs `ffmpeg` on PATH (see `packages/websocket/src/lib/thumbnail.ts`),
 * so on any install without it the URL is a 404 and the asset grid paints an
 * empty tile — `background-image` fails silently, and the video branch's
 * `thumb_url || get_url` fallback is no better, because no browser paints an
 * MP4 as a background image.
 *
 * Images never showed this because their `get_url` fallback *is* paintable.
 *
 * So: probe `thumb_url` once per URL, and when it does not load, decode a
 * frame from the video itself through the same hidden-video/canvas extractor
 * the timeline filmstrip uses. Extraction is shared, cached and concurrency
 * limited there. When both fail the caller gets `null` and shows an icon.
 */
import { useEffect, useState } from "react";

import {
  extractVideoFrames,
  getThumbnails,
  requestThumbnailsFrom,
  subscribeThumbnails
} from "../components/timeline/Tracks/clipThumbnails";

/** Width of the decoded poster. Matches the server thumbnail's long edge. */
const POSTER_WIDTH_PX = 512;
/** Seek offset for the poster frame — the first second is often black. */
const POSTER_TIME_SECONDS = 1;

type ProbeState = "pending" | "ok" | "failed";

/** Probe results per thumbnail URL, so a 404 is paid for once per session. */
const probes = new Map<string, ProbeState>();
const probeSubscribers = new Map<string, Set<() => void>>();

function notifyProbe(url: string): void {
  const set = probeSubscribers.get(url);
  if (!set) return;
  for (const cb of set) cb();
}

function subscribeProbe(url: string, cb: () => void): () => void {
  let set = probeSubscribers.get(url);
  if (!set) {
    set = new Set();
    probeSubscribers.set(url, set);
  }
  set.add(cb);
  return () => {
    set?.delete(cb);
    if (set && set.size === 0) probeSubscribers.delete(url);
  };
}

/**
 * Load `url` in a detached `Image` to learn whether the stored thumbnail is
 * really there. Nothing is drawn from it — the browser cache makes the
 * subsequent `background-image` free.
 */
function probeThumbnail(url: string): void {
  if (probes.has(url)) return;
  probes.set(url, "pending");
  if (typeof Image === "undefined") {
    probes.set(url, "failed");
    return;
  }
  const img = new Image();
  img.onload = () => {
    probes.set(url, "ok");
    notifyProbe(url);
  };
  img.onerror = () => {
    probes.set(url, "failed");
    notifyProbe(url);
  };
  img.src = url;
}

/** Cache key for a decoded poster, namespaced away from filmstrip strips. */
function posterKey(videoUrl: string): string {
  return `poster:${videoUrl}`;
}

/**
 * The poster to paint for a video asset: the server thumbnail when it loads,
 * otherwise a frame decoded in the browser, otherwise `null`.
 */
export function useVideoThumbnail(
  thumbUrl: string | null | undefined,
  videoUrl: string | null | undefined
): string | null {
  const [, force] = useState(0);

  useEffect(() => {
    if (!thumbUrl) return;
    probeThumbnail(thumbUrl);
    return subscribeProbe(thumbUrl, () => force((v) => v + 1));
  }, [thumbUrl]);

  const probe = thumbUrl ? probes.get(thumbUrl) : undefined;
  // Only decode once the stored thumbnail is known to be missing, so the
  // common (ffmpeg present) case never spins up a video element.
  const needsFallback = !thumbUrl || probe === "failed";
  const fallbackUrl = needsFallback && videoUrl ? videoUrl : null;

  useEffect(() => {
    if (!fallbackUrl) return;
    const key = posterKey(fallbackUrl);
    requestThumbnailsFrom(key, () =>
      extractVideoFrames(
        fallbackUrl,
        [POSTER_TIME_SECONDS],
        POSTER_WIDTH_PX
      ).then((frames) =>
        frames.map(({ time, dataUrl }) => ({ time, dataUrl }))
      )
    );
    return subscribeThumbnails(key, () => force((v) => v + 1));
  }, [fallbackUrl]);

  if (thumbUrl && probe !== "failed") {
    // "pending" paints the URL optimistically: when it resolves there is no
    // flash, and when it 404s the tile was empty anyway.
    return thumbUrl;
  }
  if (!fallbackUrl) return null;
  return getThumbnails(posterKey(fallbackUrl))?.[0]?.dataUrl ?? null;
}

/** Test seam: forget probe results between cases. */
export function resetVideoThumbnailProbes(): void {
  probes.clear();
  probeSubscribers.clear();
}
