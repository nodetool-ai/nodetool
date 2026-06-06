/**
 * useLayerBitmaps — resolve layer image URLs to decoded `ImageBitmap`s.
 *
 * The preview uploads each bitmap to a GPU texture. Bitmaps are cached by URL
 * so re-renders (pan, transform drag) don't re-decode, and stale entries are
 * closed when their URL changes or the layer goes away.
 */

import { useEffect, useRef, useState } from "react";

export interface LoadedBitmap {
  bitmap: ImageBitmap;
  width: number;
  height: number;
}

export type BitmapMap = Record<string, LoadedBitmap | null>;

async function decode(url: string): Promise<ImageBitmap | null> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return await createImageBitmap(blob);
  } catch {
    return null;
  }
}

/** Map of layer id → image URL. Missing/undefined URLs resolve to `null`. */
export function useLayerBitmaps(urls: Record<string, string | undefined>): BitmapMap {
  const [bitmaps, setBitmaps] = useState<BitmapMap>({});
  // url-per-id currently loaded, so we only re-decode on change.
  const loadedUrlRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    const loadedUrls = loadedUrlRef.current;

    const work = Object.entries(urls).map(async ([id, url]) => {
      if (!url) {
        if (loadedUrls.get(id) !== undefined) loadedUrls.delete(id);
        return [id, null] as const;
      }
      if (loadedUrls.get(id) === url) return null; // already current
      const bitmap = await decode(url);
      if (cancelled) {
        bitmap?.close();
        return null;
      }
      loadedUrls.set(id, url);
      return [
        id,
        bitmap
          ? { bitmap, width: bitmap.width, height: bitmap.height }
          : null
      ] as const;
    });

    Promise.all(work).then((entries) => {
      if (cancelled) return;
      const updates = entries.filter((e): e is [string, LoadedBitmap | null] => e !== null);
      if (updates.length === 0) return;
      setBitmaps((prev) => {
        const next = { ...prev };
        for (const [id, value] of updates) {
          const old = next[id];
          if (old && old.bitmap !== value?.bitmap) old.bitmap.close();
          next[id] = value;
        }
        // Drop ids no longer present.
        for (const id of Object.keys(next)) {
          if (!(id in urls)) {
            next[id]?.bitmap.close();
            delete next[id];
            loadedUrls.delete(id);
          }
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [urls]);

  return bitmaps;
}
