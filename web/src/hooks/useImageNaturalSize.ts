import { useEffect, useState } from "react";
import type { ResolvedMediaUrl } from "../utils/resolveMediaUri";

export interface ImageNaturalSize {
  width: number;
  height: number;
}

export interface ImageNaturalSizeResult {
  /** Undefined until the image loads, and when it fails to. */
  size?: ImageNaturalSize;
  /** The image at `url` could not be decoded. */
  failed: boolean;
}

/**
 * The intrinsic pixel size of the image at `url`, read by decoding it in a
 * detached element.
 */
export function useImageNaturalSize(
  url: ResolvedMediaUrl | undefined
): ImageNaturalSizeResult {
  const [measured, setMeasured] = useState<
    { url: string; size?: ImageNaturalSize } | undefined
  >(undefined);

  useEffect(() => {
    if (!url || typeof Image === "undefined") {
      return;
    }
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) {
        return;
      }
      setMeasured(
        image.naturalWidth > 0 && image.naturalHeight > 0
          ? {
              url,
              size: { width: image.naturalWidth, height: image.naturalHeight }
            }
          : { url }
      );
    };
    image.onerror = () => {
      if (!cancelled) {
        setMeasured({ url });
      }
    };
    image.src = url;
    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [url]);

  if (!measured || measured.url !== url) {
    return { failed: false };
  }
  return measured.size
    ? { size: measured.size, failed: false }
    : { failed: true };
}
