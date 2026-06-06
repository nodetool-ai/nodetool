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

export class OffscreenVideoPool {
  private readonly container: HTMLDivElement;
  private readonly entries = new Map<string, PoolEntry>();

  constructor() {
    this.container = document.createElement("div");
    this.container.style.cssText =
      "position:fixed;width:0;height:0;overflow:hidden;pointer-events:none;opacity:0;left:-9999px;top:-9999px;";
    document.body.appendChild(this.container);
  }

  /**
   * Return a video element decoded to `timeSec` of `url`. Resolves once the
   * exact frame is available. Subsequent calls for the same url reuse the
   * element. The returned element must be uploaded synchronously by the
   * caller before the next `seek` on the same element.
   */
  async seek(url: string, timeSec: number): Promise<HTMLVideoElement> {
    const el = this.ensureElement(url);
    await this.whenMetadata(el);

    const duration = Number.isFinite(el.duration) ? el.duration : Infinity;
    const target = Math.max(
      0,
      Math.min(timeSec, Math.max(0, duration - SEEK_EPSILON_SEC))
    );

    // Already on the target frame — nothing to wait for.
    if (Math.abs(el.currentTime - target) < SEEK_EPSILON_SEC) {
      return el;
    }

    await new Promise<void>((resolve) => {
      const onSeeked = () => {
        el.removeEventListener("seeked", onSeeked);
        resolve();
      };
      el.addEventListener("seeked", onSeeked);
      el.currentTime = target;
    });
    return el;
  }

  private ensureElement(url: string): HTMLVideoElement {
    const existing = this.entries.get(url);
    if (existing) return existing.el;

    const el = document.createElement("video");
    el.preload = "auto";
    el.muted = true;
    el.playsInline = true;
    el.crossOrigin = "anonymous";
    el.src = url;
    el.load();
    this.container.appendChild(el);
    this.entries.set(url, { el, url });
    return el;
  }

  private whenMetadata(el: HTMLVideoElement): Promise<void> {
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
      const cleanup = () => {
        el.removeEventListener("loadedmetadata", onLoaded);
        el.removeEventListener("error", onError);
      };
      el.addEventListener("loadedmetadata", onLoaded);
      el.addEventListener("error", onError);
    });
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
