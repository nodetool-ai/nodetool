/**
 * Probe the real duration (in milliseconds) of a media URL by loading its
 * metadata into a detached media element.
 *
 * Imported assets frequently have no server-side `duration` (the asset upload
 * path does not probe media), so callers that derive clip geometry from
 * `asset.duration` get a placeholder length. This reads the true duration from
 * the bytes the browser already needs to fetch for playback.
 *
 * Resolves to `null` when the duration cannot be determined (load error,
 * non-finite duration, or no DOM available).
 */
export function probeMediaDurationMs(
  url: string,
  kind: "video" | "audio"
): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve(null);
      return;
    }

    const el = document.createElement(kind) as HTMLMediaElement;
    let settled = false;

    const finish = (value: number | null) => {
      if (settled) {
        return;
      }
      settled = true;
      el.removeAttribute("src");
      try {
        el.load();
      } catch {
        // Detached element; nothing to release.
      }
      resolve(value);
    };

    el.preload = "metadata";
    el.onloadedmetadata = () => {
      const seconds = el.duration;
      finish(
        Number.isFinite(seconds) && seconds > 0
          ? Math.round(seconds * 1000)
          : null
      );
    };
    el.onerror = () => finish(null);
    el.src = url;
  });
}
