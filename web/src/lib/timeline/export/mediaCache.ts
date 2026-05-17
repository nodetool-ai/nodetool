/**
 * Deterministic source loader for the timeline exporter.
 *
 * Unlike the live preview which seeks via `play()` + rAF, export needs a
 * *guarantee* that the video element is showing the requested frame before
 * we read its pixels. We achieve that by:
 *   1. Setting `currentTime` to the target.
 *   2. Awaiting the `seeked` event (the decoder repositioned).
 *   3. Awaiting `requestVideoFrameCallback` so the new frame is on the
 *      element's compositor surface (browser-side display).
 *
 * Without step 3 some Chromium versions return the previous frame to
 * `copyExternalImageToTexture` even though `seeked` already fired.
 */

interface VideoEntry {
  el: HTMLVideoElement;
  url: string;
  loaded: boolean;
  loadPromise: Promise<void>;
}

interface ImageEntry {
  el: HTMLImageElement;
  url: string;
  loaded: boolean;
  loadPromise: Promise<void>;
}

const VFC_TIMEOUT_MS = 1500;

export class ExportMediaCache {
  private videos = new Map<string, VideoEntry>();
  private images = new Map<string, ImageEntry>();
  private container: HTMLDivElement | null = null;

  /**
   * Container is attached to document.body but absolutely positioned at 1×1
   * with opacity 0, so the decoders stay active without affecting layout.
   */
  private ensureContainer(): HTMLDivElement {
    if (this.container) return this.container;
    const div = document.createElement("div");
    div.style.cssText =
      "position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;left:-9999px;top:-9999px;";
    document.body.appendChild(div);
    this.container = div;
    return div;
  }

  /**
   * Resolves to a video element whose displayed frame is at `sourceTimeSec`
   * (inside the asset's own timeline). Rejects on the `signal` or on a load
   * failure. Subsequent calls for the same URL reuse the element.
   */
  async getVideoAt(
    url: string,
    sourceTimeSec: number,
    signal?: AbortSignal
  ): Promise<HTMLVideoElement> {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");

    let entry = this.videos.get(url);
    if (!entry) {
      const container = this.ensureContainer();
      const el = document.createElement("video");
      el.preload = "auto";
      el.muted = true;
      el.playsInline = true;
      el.crossOrigin = "anonymous";
      el.style.cssText = "position:absolute;width:1px;height:1px;opacity:0;";
      el.src = url;
      container.appendChild(el);

      const loadPromise = new Promise<void>((resolve, reject) => {
        const onLoaded = () => {
          el.removeEventListener("loadeddata", onLoaded);
          el.removeEventListener("error", onError);
          resolve();
        };
        const onError = () => {
          el.removeEventListener("loadeddata", onLoaded);
          el.removeEventListener("error", onError);
          reject(new Error(`video load failed: ${url}`));
        };
        el.addEventListener("loadeddata", onLoaded);
        el.addEventListener("error", onError);
        el.load();
      });

      entry = { el, url, loaded: false, loadPromise };
      this.videos.set(url, entry);
    }

    await entry.loadPromise;
    entry.loaded = true;
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");

    const target = Math.max(
      0,
      Math.min(entry.el.duration || sourceTimeSec, sourceTimeSec)
    );
    await seekVideoTo(entry.el, target, signal);
    return entry.el;
  }

  /**
   * Resolves to an image element that has finished decoding. Subsequent
   * calls for the same URL reuse the element.
   */
  async getImage(url: string, signal?: AbortSignal): Promise<HTMLImageElement> {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");

    let entry = this.images.get(url);
    if (!entry) {
      const el = new Image();
      el.crossOrigin = "anonymous";
      el.decoding = "async";
      el.src = url;
      const loadPromise = (async () => {
        await el.decode().catch(() => {
          // decode() can reject on some codec/CORS edge cases; the load
          // event below usually still fires. Fall back to event-based wait.
          return new Promise<void>((resolve, reject) => {
            if (el.complete && el.naturalWidth > 0) {
              resolve();
              return;
            }
            el.addEventListener("load", () => resolve(), { once: true });
            el.addEventListener(
              "error",
              () => reject(new Error(`image load failed: ${url}`)),
              { once: true }
            );
          });
        });
      })();
      entry = { el, url, loaded: false, loadPromise };
      this.images.set(url, entry);
    }

    await entry.loadPromise;
    entry.loaded = true;
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    return entry.el;
  }

  dispose(): void {
    for (const { el } of this.videos.values()) {
      el.pause();
      el.removeAttribute("src");
      el.load();
      el.remove();
    }
    this.videos.clear();
    this.images.clear();
    this.container?.remove();
    this.container = null;
  }
}

/**
 * Seeks a video element and resolves once the frame at `targetSec` is on the
 * element's display surface. Uses `requestVideoFrameCallback` when available
 * for frame-accurate sync, otherwise falls back to the `seeked` event.
 */
export async function seekVideoTo(
  el: HTMLVideoElement,
  targetSec: number,
  signal?: AbortSignal
): Promise<void> {
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");

  // If we're already close enough, no seek needed. 1 ms threshold matches
  // typical mp4 frame timestamps.
  if (Math.abs(el.currentTime - targetSec) < 0.001) {
    // Still wait one rVFC so the display surface is guaranteed current.
    await waitForVideoFrame(el, signal);
    return;
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
      reject(new Error("video seek failed"));
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException("aborted", "AbortError"));
    };
    el.addEventListener("seeked", onSeeked, { once: true });
    el.addEventListener("error", onError, { once: true });
    signal?.addEventListener("abort", onAbort, { once: true });
    el.currentTime = targetSec;
  });

  await waitForVideoFrame(el, signal);
}

function waitForVideoFrame(
  el: HTMLVideoElement,
  signal?: AbortSignal
): Promise<void> {
  if (typeof el.requestVideoFrameCallback !== "function") {
    // No rVFC support — best we can do is the next macrotask, since the
    // seeked event has already fired.
    return new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return new Promise<void>((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let handle: number | null = null;
    const onAbort = () => {
      if (timeoutId !== null) clearTimeout(timeoutId);
      if (handle !== null && typeof el.cancelVideoFrameCallback === "function") {
        el.cancelVideoFrameCallback(handle);
      }
      signal?.removeEventListener("abort", onAbort);
      reject(new DOMException("aborted", "AbortError"));
    };
    handle = el.requestVideoFrameCallback(() => {
      if (timeoutId !== null) clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onAbort);
      resolve();
    });
    // Decoders that have already pre-rolled the frame may not fire rVFC
    // again until the next paint. A bounded timeout keeps export from
    // stalling on idle elements.
    timeoutId = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, VFC_TIMEOUT_MS);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
