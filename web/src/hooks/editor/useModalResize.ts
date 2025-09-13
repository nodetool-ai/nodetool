import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

  const dragStartY = useRef(0);
  const startHeight = useRef(0);

  const handleResizeMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      dragStartY.current = event.clientY;
      startHeight.current = modalHeight;

      const handleMouseMove = (e: MouseEvent) => {
        const delta = e.clientY - dragStartY.current;
        const newHeight = startHeight.current + delta;
        updateModalHeight(newHeight);
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);

      event.preventDefault();
    },
    [modalHeight, updateModalHeight]
  );

  useEffect(() => {
    return () => {
      try {
        (saveHeightToStorage as any).cancel?.();
      } catch {
        /* empty */
      }
    };
  }, [saveHeightToStorage]);

  return { modalHeight, setModalHeight, handleResizeMouseDown } as const;
}

// local utility to avoid importing lodash globally here; caller may already bundle lodash
function debounce<T extends (...args: any[]) => void>(fn: T, wait: number) {
  let t: number | undefined;
  const debounced = (...args: Parameters<T>) => {
    if (t) window.clearTimeout(t);
    t = window.setTimeout(() => fn(...args), wait);
  };
  (debounced as any).cancel = () => {
    if (t) {
      window.clearTimeout(t);
      t = undefined;
    }
  };
  return debounced as T & { cancel: () => void };
}
