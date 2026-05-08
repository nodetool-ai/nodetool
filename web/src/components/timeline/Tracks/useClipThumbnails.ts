import { useEffect, useState } from "react";
import {
  getThumbnails,
  requestThumbnails,
  subscribeThumbnails,
  type ClipThumbnail
} from "./clipThumbnails";

const THUMB_WIDTH_PX = 160;
/** Source-side count — enough samples to interpolate any visible filmstrip
 *  density, capped to keep the extraction quick. */
const SOURCE_COUNT = 24;

/**
 * Returns the cached thumbnails for `url`, kicking off extraction the
 * first time the URL is seen. Re-renders when the result becomes ready.
 */
export function useClipThumbnails(url: string | undefined): ClipThumbnail[] | null {
  const [, force] = useState(0);

  useEffect(() => {
    if (!url) return;
    requestThumbnails(url, SOURCE_COUNT, THUMB_WIDTH_PX);
    return subscribeThumbnails(url, () => force((v) => v + 1));
  }, [url]);

  return url ? getThumbnails(url) : null;
}
