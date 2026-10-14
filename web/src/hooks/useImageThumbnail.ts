/**
 * Thumbnail URL for a stored image, retried while the server is still
 * writing it.
 *
 * The server mints `thumb_url` from a deterministic storage key without
 * checking that the object exists. An upload creates the asset row (and
 * broadcasts the change) before it stores the bytes and the thumbnail, so a
 * grid refetch can list the new asset while its thumbnail is still a 404. A
 * `background-image` that failed never reloads while its URL stays the same,
 * so the tile stayed black for the rest of the session.
 *
 * So: probe `thumb_url` in a detached `Image`. While it fails, return the
 * full image (`get_url`), which is paintable, and probe the thumbnail again
 * with backoff. Once the thumbnail loads, return it; the URL change makes the
 * tile paint it from the cache.
 */
import { useEffect, useState } from "react";

/** Delay before the first retry; doubles on each further attempt. */
export const THUMBNAIL_RETRY_BASE_MS = 500;
/** Retries after the first failed probe before settling on `get_url`. */
export const THUMBNAIL_MAX_RETRIES = 5;

type ProbeState = { url: string; status: "ok" | "failed" };

export const useImageThumbnail = (
  thumbUrl: string | null | undefined,
  getUrl: string | null | undefined
): string | null => {
  const [probe, setProbe] = useState<ProbeState | null>(null);

  useEffect(() => {
    if (!thumbUrl || typeof Image === "undefined") {
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let img: HTMLImageElement | null = null;

    const attempt = (retry: number): void => {
      img = new Image();
      img.onload = () => {
        if (!cancelled) {
          setProbe({ url: thumbUrl, status: "ok" });
        }
      };
      img.onerror = () => {
        if (cancelled) {
          return;
        }
        setProbe({ url: thumbUrl, status: "failed" });
        if (retry < THUMBNAIL_MAX_RETRIES) {
          timer = setTimeout(
            () => attempt(retry + 1),
            THUMBNAIL_RETRY_BASE_MS * 2 ** retry
          );
        }
      };
      img.src = thumbUrl;
    };

    attempt(0);

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
      if (img) {
        img.onload = null;
        img.onerror = null;
      }
    };
  }, [thumbUrl]);

  if (!thumbUrl) {
    return getUrl ?? null;
  }
  if (probe?.url === thumbUrl && probe.status === "failed") {
    return getUrl ?? thumbUrl;
  }
  return thumbUrl;
};
