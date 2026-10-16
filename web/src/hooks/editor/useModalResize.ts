import { useCallback, useEffect, useMemo, useState } from "react";
import { debounce } from "../../utils/lodashAlternatives";

interface UseModalResizeOptions {
  storageKey?: string;
  minHeight?: number;
  defaultHeight?: number;
  maxHeight?: number;
}

export function useModalResize(options: UseModalResizeOptions = {}) {
  const {
    storageKey = "textEditorModal_height",
    minHeight = 250,
    defaultHeight = Math.min(600, window.innerHeight - 200),
    maxHeight = window.innerHeight - 120
  } = options;

  const getInitialHeight = useCallback(() => {
    try {
      const savedHeight = localStorage.getItem(storageKey);
      if (savedHeight) {
        const height = parseInt(savedHeight, 10);
        if (height >= minHeight && height <= maxHeight) {
          return height;
        }
      }
    } catch {
      /* empty */
    }
    return defaultHeight;
  }, [storageKey, minHeight, maxHeight, defaultHeight]);

  const [modalHeight, setModalHeight] = useState<number>(getInitialHeight);

  const saveHeightToStorage = useMemo(
    () =>
      debounce((height: number) => {
        try {
          localStorage.setItem(storageKey, height.toString());
        } catch {
          /* empty */
        }
      }, 500),
    [storageKey]
  );

  const updateModalHeight = useCallback(
    (newHeight: number) => {
      const clampedHeight = Math.max(minHeight, Math.min(newHeight, maxHeight));
      setModalHeight(clampedHeight);
      saveHeightToStorage(clampedHeight);
    },
    [minHeight, maxHeight, saveHeightToStorage]
  );

  /** Grow or shrink the modal by `delta` px, clamped and persisted. */
  const resizeBy = useCallback(
    (delta: number) => updateModalHeight(modalHeight + delta),
    [modalHeight, updateModalHeight]
  );

  useEffect(() => {
    return () => {
      try {
        (saveHeightToStorage as { cancel?: () => void }).cancel?.();
      } catch {
        /* empty */
      }
    };
  }, [saveHeightToStorage]);

  return { modalHeight, setModalHeight, resizeBy, minHeight, maxHeight } as const;
}
