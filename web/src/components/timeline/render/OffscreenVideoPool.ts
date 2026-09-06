/**
 * OffscreenVideoPool — deterministic, frame-accurate decoding of clip videos
 * for offline rendering.
 *
 * Unlike the live preview (which plays elements in real time and uploads
 * whatever frame happens to be decoded), the renderer seeks each video element
 * to an exact source time and waits for the `seeked` event before handing the
 * element to the compositor. That makes every exported frame reproducible and
 * tearing-free, however slow the underlying decode is.
 *
 * A `<video>` element that fires `error` is dead: the browser tears down its
 * decoder and every later seek errors too. Range requests against the asset
 * server do fail mid-export (a dropped connection, a decoder reset after
 * hundreds of seeks), so a failed or stalled seek is retried on a fresh
 * element before the export is failed.
 */

const SEEK_EPSILON_SEC = 1 / 1000;

/** Fresh elements tried for one seek before it is reported as a failure. */
export const SEEK_ATTEMPTS = 3;
/** Pause before a retry, so a server that just dropped the connection has a
 *  moment to accept a new one. Grows linearly per attempt. */
const RETRY_DELAY_MS = 250;
/** A seek that has not fired `seeked` by then is treated as stalled: the
 *  element is replaced and the seek retried. The decode of one frame never
 *  takes this long; a hung range request does. */
export const SEEK_TIMEOUT_MS = 15_000;

interface PoolEntry {
  el: HTMLVideoElement;
  url: string;
}

interface PoolOptions {
  seekTimeoutMs?: number;
  retryDelayMs?: number;
  attempts?: number;
}

function abortError(): DOMException {
  return new DOMException("Video seek aborted", "AbortError");
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

const MEDIA_ERROR_NAMES: Record<number, string> = {
  1: "MEDIA_ERR_ABORTED",
  2: "MEDIA_ERR_NETWORK",
  3: "MEDIA_ERR_DECODE",
  4: "MEDIA_ERR_SRC_NOT_SUPPORTED"
};

/** "MEDIA_ERR_NETWORK (2): <browser message>" — the part of a media failure
 *  the user can act on, instead of only the URL. */
export function describeMediaError(el: HTMLVideoElement): string {
  const err = el.error;
  if (!err) return "no media error reported";
  const name = MEDIA_ERROR_NAMES[err.code] ?? "MEDIA_ERR_UNKNOWN";
  const message = err.message?.trim();
  return message ? `${name} (${err.code}): ${message}` : `${name} (${err.code})`;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export class OffscreenVideoPool {
  private readonly container: HTMLDivElement;
  /** Keyed by clip id — two clips of the same asset must hold separate
   *  elements, since the export loop seeks every layer of a frame before any
   *  upload happens (a shared element would show the last-seeked time on all
   *  layers). Elements are still reused across frames for the same clip. */
  private readonly entries = new Map<string, PoolEntry>();
  private readonly seekTimeoutMs: number;
  private readonly retryDelayMs: number;
  private readonly attempts: number;

  constructor(options: PoolOptions = {}) {
    this.seekTimeoutMs = options.seekTimeoutMs ?? SEEK_TIMEOUT_MS;
    this.retryDelayMs = options.retryDelayMs ?? RETRY_DELAY_MS;
    this.attempts = Math.max(1, options.attempts ?? SEEK_ATTEMPTS);
    this.container = document.createElement("div");
    this.container.style.cssText =
      "position:fixed;width:0;height:0;overflow:hidden;pointer-events:none;opacity:0;left:-9999px;top:-9999px;";
    document.body.appendChild(this.container);
  }

  /**
   * Return a video element for `clipId` decoded to `timeSec` of `url`.
   * Resolves once the exact frame is available; rejects when `signal` aborts
   * or when every attempt hit a media error or stalled. Subsequent calls for
   * the same clip reuse the element. The returned element must be uploaded
   * synchronously by the caller before the next `seek` for the same clip.
   */
  async seek(
    clipId: string,
    url: string,
    timeSec: number,
    signal?: AbortSignal
  ): Promise<HTMLVideoElement> {
    let lastError: unknown;
    for (let attempt = 0; attempt < this.attempts; attempt++) {
      if (signal?.aborted) throw abortError();
      if (attempt > 0) {
        // The previous element is in an error state (or hung); a fresh one
        // reopens the connection and the decoder from scratch.
        this.release(clipId);
        await delay(this.retryDelayMs * attempt, signal);
      }
      try {
        return await this.seekOnce(clipId, url, timeSec, signal);
      } catch (err) {
        if (isAbort(err)) throw err;
        lastError = err;
      }
    }
    const reason = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(
      `Video seek failed after ${this.attempts} attempts: ${reason}`
    );
  }

  private async seekOnce(
    clipId: string,
    url: string,
    timeSec: number,
    signal?: AbortSignal
  ): Promise<HTMLVideoElement> {
    const el = this.ensureElement(clipId, url);
    if (el.error) {
      // An element that already failed never recovers; replacing it here
      // makes the retry loop's fresh element the one that gets seeked.
      throw new Error(
        `Video failed to load: ${describeMediaError(el)}: ${el.src}`
      );
    }
    await this.whenMetadata(el, signal);

    const duration = Number.isFinite(el.duration) ? el.duration : Infinity;
    const target = Math.max(
      0,
      Math.min(timeSec, Math.max(0, duration - SEEK_EPSILON_SEC))
    );

    // Already on the target frame — nothing to wait for.
    if (Math.abs(el.currentTime - target) < SEEK_EPSILON_SEC && !el.seeking) {
      return el;
    }

    await new Promise<void>((resolve, reject) => {
      const timer =
        this.seekTimeoutMs > 0
          ? setTimeout(() => {
              cleanup();
              reject(
                new Error(
                  `Video seek to ${target.toFixed(3)}s stalled for ${this.seekTimeoutMs}ms: ${el.src}`
                )
              );
            }, this.seekTimeoutMs)
          : null;
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        el.removeEventListener("seeked", onSeeked);
        el.removeEventListener("error", onError);
        signal?.removeEventListener("abort", onAbort);
      };
      const onSeeked = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(
          new Error(
            `Video error while seeking to ${target.toFixed(3)}s: ${describeMediaError(el)}: ${el.src}`
          )
        );
      };
      const onAbort = () => {
        cleanup();
        reject(abortError());
      };
      el.addEventListener("seeked", onSeeked);
      el.addEventListener("error", onError);
      signal?.addEventListener("abort", onAbort);
      el.currentTime = target;
    });
    return el;
  }

  private ensureElement(clipId: string, url: string): HTMLVideoElement {
    const existing = this.entries.get(clipId);
    if (existing) {
      if (existing.url === url) return existing.el;
      // Clip resolved to a new asset mid-render — point the element at it.
      existing.el.src = url;
      existing.el.load();
      existing.url = url;
      return existing.el;
    }

    const el = document.createElement("video");
    el.preload = "auto";
    el.muted = true;
    el.playsInline = true;
    el.crossOrigin = "anonymous";
    el.src = url;
    el.load();
    this.container.appendChild(el);
    this.entries.set(clipId, { el, url });
    return el;
  }

  private whenMetadata(
    el: HTMLVideoElement,
    signal?: AbortSignal
  ): Promise<void> {
    // readyState >= HAVE_METADATA means duration + dimensions are known.
    if (el.readyState >= 1 && el.videoWidth > 0) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timer =
        this.seekTimeoutMs > 0
          ? setTimeout(() => {
              cleanup();
              reject(
                new Error(
                  `Video metadata not loaded after ${this.seekTimeoutMs}ms: ${el.src}`
                )
              );
            }, this.seekTimeoutMs)
          : null;
      const onLoaded = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(
          new Error(
            `Failed to load video: ${describeMediaError(el)}: ${el.src}`
          )
        );
      };
      const onAbort = () => {
        cleanup();
        reject(abortError());
      };
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        el.removeEventListener("loadedmetadata", onLoaded);
        el.removeEventListener("error", onError);
        signal?.removeEventListener("abort", onAbort);
      };
      el.addEventListener("loadedmetadata", onLoaded);
      el.addEventListener("error", onError);
      signal?.addEventListener("abort", onAbort);
    });
  }

  /**
   * Tear down the element held for `clipId` immediately, ahead of `dispose()`.
   * The render loop calls this once a clip's fixed time range has fully
   * passed — each clip occupies a single contiguous span, so a released clip
   * can never be seeked again. Without this, a many-clip export pins one live
   * `<video>` element (and hardware decoder) per clip for the whole render,
   * well past what browsers/decoders allow concurrently. A failed seek also
   * releases its element so the retry starts from a fresh one.
   */
  release(clipId: string): void {
    const entry = this.entries.get(clipId);
    if (!entry) return;
    entry.el.pause();
    entry.el.removeAttribute("src");
    entry.el.load();
    entry.el.remove();
    this.entries.delete(clipId);
  }

  dispose(): void {
    for (const { el } of this.entries.values()) {
      el.pause();
      el.removeAttribute("src");
      el.load();
    }
    this.entries.clear();
    this.container.remove();
  }
}
