/**
 * OffscreenVideoPool — deterministic, frame-accurate decoding of clip videos
 * for offline rendering.
 *
 * Unlike the live preview (which plays elements in real time and uploads
 * whatever frame happens to be decoded), the renderer seeks each video element
 * to an exact source time and waits for the `seeked` event before handing the
 * element to the compositor. That makes every exported frame reproducible and
 * tearing-free, however slow the underlying decode is.
 */

const SEEK_EPSILON_SEC = 1 / 1000;

interface PoolEntry {
  el: HTMLVideoElement;
  url: string;
}

function abortError(): DOMException {
  return new DOMException("Video seek aborted", "AbortError");
}

export class OffscreenVideoPool {
  private readonly container: HTMLDivElement;
  /** Keyed by clip id — two clips of the same asset must hold separate
   *  elements, since the export loop seeks every layer of a frame before any
   *  upload happens (a shared element would show the last-seeked time on all
   *  layers). Elements are still reused across frames for the same clip. */
  private readonly entries = new Map<string, PoolEntry>();

  constructor() {
    this.container = document.createElement("div");
    this.container.style.cssText =
      "position:fixed;width:0;height:0;overflow:hidden;pointer-events:none;opacity:0;left:-9999px;top:-9999px;";
    document.body.appendChild(this.container);
  }

  /**
   * Return a video element for `clipId` decoded to `timeSec` of `url`.
   * Resolves once the exact frame is available; rejects on media error or
   * when `signal` aborts. Subsequent calls for the same clip reuse the
   * element. The returned element must be uploaded synchronously by the
   * caller before the next `seek` for the same clip.
   */
  async seek(
    clipId: string,
    url: string,
    timeSec: number,
    signal?: AbortSignal
  ): Promise<HTMLVideoElement> {
    if (signal?.aborted) throw abortError();
    const el = this.ensureElement(clipId, url);
    await this.whenMetadata(el, signal);

    const duration = Number.isFinite(el.duration) ? el.duration : Infinity;
    const target = Math.max(
      0,
      Math.min(timeSec, Math.max(0, duration - SEEK_EPSILON_SEC))
    );

    // Already on the target frame — nothing to wait for.
    if (Math.abs(el.currentTime - target) < SEEK_EPSILON_SEC) {
      return el;
    }

    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
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
        reject(new Error(`Video error while seeking: ${el.src}`));
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
      const onLoaded = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error(`Failed to load video: ${el.src}`));
      };
      const onAbort = () => {
        cleanup();
        reject(abortError());
      };
      const cleanup = () => {
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
   * well past what browsers/decoders allow concurrently.
   */
  release(clipId: string): void {
    const entry = this.entries.get(clipId);
    if (!entry) return;
    entry.el.pause();
    entry.el.removeAttribute("src");
    entry.el.load();
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
