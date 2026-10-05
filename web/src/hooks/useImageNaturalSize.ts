import { useEffect, useState } from "react";
import type { ResolvedMediaUrl } from "../utils/resolveMediaUri";

export interface ImageNaturalSize {
  width: number;
  height: number;
}

/**
 * The intrinsic pixel size of the image at `url`, read by decoding it in a
 * detached element. Undefined until the image loads, and when it fails to.
 */
export function useImageNaturalSize(
  url: ResolvedMediaUrl | undefined
): ImageNaturalSize | undefined {
  const [measured, setMeasured] = useState<
    { url: string; size: ImageNaturalSize } | undefined
  >(undefined);

  useEffect(() => {
    if (!url || typeof Image === "undefined") {
      return;
    }
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled && image.naturalWidth > 0 && image.naturalHeight > 0) {
        setMeasured({
          url,
          size: { width: image.naturalWidth, height: image.naturalHeight }
        });
      }
    };
    image.src = url;
    return () => {
      cancelled = true;
      image.onload = null;
    };
  }, [url]);

  return measured && measured.url === url ? measured.size : undefined;
}
