/**
 * OffscreenVideoPool — deterministic decoding of clip videos for export.
 *
 * Sequential exports use timestamped WebCodecs frames when supported. The
 * seeked-element path remains available for unsupported codecs and retiming.
 *
 * A `<video>` element that fires `error` is dead: the browser tears down its
 * decoder and every later seek errors too. Range requests against the asset
 * server do fail mid-export (a dropped connection, a decoder reset after
 * hundreds of seeks), so a failed or stalled seek is retried on a fresh
 * element before the export is failed.
 */

import { SequentialVideoSource } from "./SequentialVideoSource";

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
  /** A generated matte and its picture share a clip id but have different
   *  assets. Both must retain their own frame until compositing finishes. */
  private readonly entries = new Map<string, PoolEntry>();
  private readonly decoded = new Map<string, SequentialVideoSource>();
  private readonly opening = new Map<string, { controller: AbortController; promise: Promise<SequentialVideoSource | null> }>();
  /** Concurrent different times cannot share a bitmap before both uploads. */
  private readonly activeRequests = new Map<string, {
    timeSec: number;
    promise: Promise<HTMLVideoElement | ImageBitmap>;
    controller: AbortController;
  }>();
  private readonly unavailable = new Set<string>();
  private disposed = false;
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
   * Return pixels for `clipId` decoded to `timeSec` of `url`.
   * Resolves once the requested frame is available; rejects when `signal`
   * aborts or all seek attempts fail. The returned source must be uploaded
   * before the next `seek` for the same clip.
   */
  seek(
    clipId: string,
    url: string,
    timeSec: number,
    signal?: AbortSignal
  ): Promise<HTMLVideoElement | ImageBitmap> {
    const key = `${clipId}\0${url}`;
    if (this.disposed) return Promise.reject(abortError());
    const active = this.activeRequests.get(key);
    if (active) {
      if (active.timeSec !== timeSec) {
        return Promise.reject(new Error("Concurrent video requests for different source times"));
      }
      return active.promise;
    }
    const controller = new AbortController();
    const onAbort = (): void => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) controller.abort();
    const promise = this.seekSource(key, url, timeSec, controller.signal);
    this.activeRequests.set(key, { timeSec, promise, controller });
    const clear = () => {
      signal?.removeEventListener("abort", onAbort);
      if (this.activeRequests.get(key)?.promise === promise) this.activeRequests.delete(key);
    };
    void promise.then(clear, clear);
    return promise;
  }

  private async seekSource(
    key: string,
    url: string,
    timeSec: number,
    signal?: AbortSignal
  ): Promise<HTMLVideoElement | ImageBitmap> {
    if (typeof VideoDecoder !== "undefined" && !this.unavailable.has(key)) {
      try {
        let source = this.decoded.get(key);
        if (!source) {
          const controller = new AbortController();
          const onAbort = () => controller.abort();
          signal?.addEventListener("abort", onAbort, { once: true });
          if (signal?.aborted) controller.abort();
          const promise = SequentialVideoSource.open(url, controller.signal);
          this.opening.set(key, { controller, promise });
          try {
            source = await promise ?? undefined;
            if (controller.signal.aborted || this.disposed || this.opening.get(key)?.promise !== promise) {
              source?.dispose();
              throw abortError();
            }
          } finally {
            signal?.removeEventListener("abort", onAbort);
            if (this.opening.get(key)?.promise === promise) this.opening.delete(key);
          }
          if (source) {
            this.decoded.set(key, source);
          } else {
            this.unavailable.add(key);
          }
        }
        if (source) return await source.frameAt(timeSec, signal);
      } catch (error) {
        this.releaseKey(key);
        if (isAbort(error) || signal?.aborted) throw error;
        this.unavailable.add(key);
      }
    }
    return this.seekElement(key, url, timeSec, signal);
  }

  private async seekElement(
    key: string,
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
        this.releaseKey(key);
        await delay(this.retryDelayMs * attempt, signal);
      }
      try {
        return await this.seekOnce(key, url, timeSec, signal);
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
    key: string,
    url: string,
    timeSec: number,
    signal?: AbortSignal
  ): Promise<HTMLVideoElement> {
    const el = this.ensureElement(key, url);
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
      await this.whenCurrentData(el, signal);
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

  private ensureElement(key: string, url: string): HTMLVideoElement {
    const existing = this.entries.get(key);
    if (existing) {
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
    this.entries.set(key, { el });
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

  private whenCurrentData(el: HTMLVideoElement, signal?: AbortSignal): Promise<void> {
    if (el.readyState >= 2) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timer = this.seekTimeoutMs > 0
        ? setTimeout(() => {
            cleanup();
            reject(new Error(`Video frame not decoded after ${this.seekTimeoutMs}ms: ${el.src}`));
          }, this.seekTimeoutMs)
        : null;
      const cleanup = (): void => {
        if (timer) clearTimeout(timer);
        el.removeEventListener("loadeddata", onLoaded);
        el.removeEventListener("error", onError);
        signal?.removeEventListener("abort", onAbort);
      };
      const onLoaded = (): void => {
        if (el.readyState < 2) return;
        cleanup();
        resolve();
      };
      const onError = (): void => {
        cleanup();
        reject(new Error(`Video error before first frame: ${describeMediaError(el)}: ${el.src}`));
      };
      const onAbort = (): void => {
        cleanup();
        reject(abortError());
      };
      el.addEventListener("loadeddata", onLoaded);
      el.addEventListener("error", onError);
      signal?.addEventListener("abort", onAbort);
      if (signal?.aborted) onAbort();
      else if (el.readyState >= 2) onLoaded();
    });
  }

  /**
   * Tear down the decoder or element held for `clipId` ahead of `dispose()`.
   * The render loop calls this once a clip's fixed time range has fully
   * passed. This caps live decoders at the overlap width. A failed element
   * seek also releases its element so the retry starts fresh.
   */
  release(clipId: string): void {
    const prefix = `${clipId}\0`;
    for (const key of this.decoded.keys()) {
      if (key.startsWith(prefix)) this.releaseKey(key);
    }
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) this.releaseKey(key);
    }
    for (const key of this.opening.keys()) {
      if (key.startsWith(prefix)) this.releaseKey(key);
    }
    for (const key of this.unavailable) {
      if (key.startsWith(prefix)) this.unavailable.delete(key);
    }
  }

  private releaseKey(key: string): void {
    this.opening.get(key)?.controller.abort();
    this.opening.delete(key);
    this.decoded.get(key)?.dispose();
    this.decoded.delete(key);
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.el.pause();
    entry.el.removeAttribute("src");
    entry.el.load();
    entry.el.remove();
    this.entries.delete(key);
  }

  dispose(): void {
    this.disposed = true;
    for (const { controller } of this.activeRequests.values()) controller.abort();
    for (const { controller } of this.opening.values()) controller.abort();
    for (const source of this.decoded.values()) source.dispose();
    this.decoded.clear();
    this.opening.clear();
    this.activeRequests.clear();
    this.unavailable.clear();
    for (const { el } of this.entries.values()) {
      el.pause();
      el.removeAttribute("src");
      el.load();
    }
    this.entries.clear();
    this.container.remove();
  }
}
