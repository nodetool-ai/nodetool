/**
 * Clip filmstrip thumbnails — extracts N frames from a video URL via a
 * hidden HTMLVideoElement + canvas. Same idea as openreel's
 * `generateFilmstripThumbnails`, but without the MediaBunny dependency.
 *
 * Singleton: components that need thumbnails for the same URL share one
 * extraction pass and one set of data URLs. A small concurrency limit
 * keeps the page responsive while many clips request thumbnails at once.
 */

export interface ClipThumbnail {
  /** Frame timestamp in seconds within the source video. */
  time: number;
  /** JPEG data URL of the rendered frame. */
  dataUrl: string;
}

export interface ClipFrame extends ClipThumbnail {
  /** Requested frame timestamp in seconds within the source video. */
  requestedTime: number;
  width: number;
  height: number;
}

interface CacheEntry {
  state: "pending" | "ready" | "failed";
  thumbnails?: ClipThumbnail[];
  promise?: Promise<ClipThumbnail[]>;
  /** `Date.now()` when a "failed" entry was recorded; drives the retry window. */
  failedAt?: number;
}

/** Cap on distinct video URLs held in `cache`, each worth up to 24 JPEG data
 *  URLs. Insertion order in the Map doubles as recency order: every access
 *  re-inserts its key (see `touch`), so the front of the Map is always the
 *  least-recently-used entry. */
const MAX_CACHE_ENTRIES = 32;
/** How long a failed extraction stays poisoned before a fresh request for the
 *  same URL is allowed to retry (e.g. a transient network blip). */
const FAILURE_RETRY_MS = 30_000;

const cache = new Map<string, CacheEntry>();
const subscribers = new Map<string, Set<() => void>>();

/** Re-insert `url` so it becomes the most-recently-used entry. */
function touch(url: string, entry: CacheEntry): void {
  cache.delete(url);
  cache.set(url, entry);
}

/** Evict the least-recently-used entry once the cache exceeds its cap.
 *  In-flight ("pending") entries are never evicted — losing track of a
 *  running extraction would leak its concurrency slot. */
function evictIfNeeded(): void {
  if (cache.size <= MAX_CACHE_ENTRIES) return;
  for (const [url, entry] of cache) {
    if (entry.state === "pending") continue;
    cache.delete(url);
    return;
  }
}

const MAX_CONCURRENT = 2;
let active = 0;
const queue: Array<() => void> = [];

function runNext(): void {
  if (active >= MAX_CONCURRENT) return;
  const fn = queue.shift();
  if (!fn) return;
  active++;
  fn();
}

function notify(url: string): void {
  const set = subscribers.get(url);
  if (!set) return;
  for (const cb of set) cb();
}

function extractFrames(
  url: string,
  timestampsForDuration: (duration: number) => number[],
  width: number,
  quality: number
): Promise<ClipFrame[]> {
  return new Promise((resolve, reject) => {
    const start = (): void => {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.preload = "auto";
      video.muted = true;
      video.playsInline = true;
      video.src = url;

      const canvas = document.createElement("canvas");
      const out: ClipFrame[] = [];

      const cleanup = (): void => {
        video.removeAttribute("src");
        video.load();
        active--;
        runNext();
      };

      const fail = (err: unknown): void => {
        cleanup();
        reject(err);
      };

      video.addEventListener(
        "loadedmetadata",
        () => {
          if (!Number.isFinite(video.duration) || video.duration <= 0) {
            fail(new Error("video has no duration"));
            return;
          }
          const aspect = video.videoHeight / video.videoWidth || 9 / 16;
          canvas.width = width;
          canvas.height = Math.max(1, Math.round(width * aspect));
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            fail(new Error("2d context unavailable"));
            return;
          }

          const duration = video.duration;
          const timestamps = timestampsForDuration(duration);

          let i = 0;
          const seekNext = (): void => {
            if (i >= timestamps.length) {
              cleanup();
              resolve(out);
              return;
            }
            const onSeeked = (): void => {
              video.removeEventListener("seeked", onSeeked);
              try {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                out.push({
                  time: video.currentTime,
                  requestedTime: timestamps[i],
                  dataUrl: canvas.toDataURL("image/jpeg", quality),
                  width: canvas.width,
                  height: canvas.height
                });
                i++;
                seekNext();
              } catch (err) {
                fail(err);
              }
            };
            video.addEventListener("seeked", onSeeked);
            video.currentTime = Math.max(
              0,
              Math.min(Math.max(0, duration - 0.001), timestamps[i])
            );
          };

          seekNext();
        },
        { once: true }
      );

      video.addEventListener("error", () => fail(video.error ?? new Error("video error")), {
        once: true
      });
    };

    queue.push(start);
    runNext();
  });
}

function extract(
  url: string,
  count: number,
  width: number
): Promise<ClipThumbnail[]> {
  return extractFrames(
    url,
    (duration) =>
      count <= 1
        ? [0]
        : Array.from({ length: count }, (_, i) => (i / (count - 1)) * duration),
    width,
    0.7
  );
}

export function extractVideoFrames(
  url: string,
  timesSeconds: number[],
  width = 512,
  quality = 0.75
): Promise<ClipFrame[]> {
  return extractFrames(
    url,
    (duration) =>
      timesSeconds.map((time) =>
        Math.max(0, Math.min(Math.max(0, duration - 0.001), time))
      ),
    width,
    quality
  );
}

/** Get cached thumbnails synchronously (or null if not ready). */
export function getThumbnails(url: string): ClipThumbnail[] | null {
  const entry = cache.get(url);
  if (entry?.state !== "ready") return null;
  touch(url, entry);
  return entry.thumbnails ?? null;
}

/**
 * Kick off thumbnail extraction for `url` if it hasn't started yet. Calls
 * to this function with the same URL share a single extraction. Notifies
 * subscribers when the result is ready. A "failed" entry is retried once
 * `FAILURE_RETRY_MS` has passed instead of staying poisoned forever.
 */
export function requestThumbnails(
  url: string,
  count: number,
  width: number
): void {
  if (!url) return;
  const existing = cache.get(url);
  if (existing) {
    const retryDue =
      existing.state === "failed" &&
      Date.now() - (existing.failedAt ?? 0) >= FAILURE_RETRY_MS;
    if (!retryDue) {
      touch(url, existing);
      return; // already pending, ready, or still within the failure cooldown
    }
  }

  const entry: CacheEntry = { state: "pending" };
  const promise = extract(url, count, width)
    .then((thumbs) => {
      entry.state = "ready";
      entry.thumbnails = thumbs;
      notify(url);
      return thumbs;
    })
    .catch((err) => {
      entry.state = "failed";
      entry.failedAt = Date.now();
      notify(url);
      throw err;
    });
  entry.promise = promise;
  touch(url, entry);
  evictIfNeeded();
}

/** Subscribe to thumbnail-ready notifications for `url`. Returns unsubscribe. */
export function subscribeThumbnails(url: string, cb: () => void): () => void {
  let set = subscribers.get(url);
  if (!set) {
    set = new Set();
    subscribers.set(url, set);
  }
  set.add(cb);
  return () => {
    set?.delete(cb);
    if (set && set.size === 0) subscribers.delete(url);
  };
}
