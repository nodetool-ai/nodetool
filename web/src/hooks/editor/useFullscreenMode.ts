import { useCallback, useEffect, useState } from "react";

interface UseFullscreenModeOptions {
  storageKey?: string;
}

export function useFullscreenMode(options: UseFullscreenModeOptions = {}) {
  const { storageKey = "textEditorModal_fullscreen" } = options;

  const getInitialFullscreen = useCallback(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === "true" || saved === "false") return saved === "true";
    } catch {
      /* empty */
    }
    return false;
  }, [storageKey]);

  const [isFullscreen, setIsFullscreen] =
    useState<boolean>(getInitialFullscreen);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, isFullscreen ? "true" : "false");
    } catch {
      /* empty */
    }
  }, [isFullscreen, storageKey]);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((v) => !v);
  }, []);

  return { isFullscreen, setIsFullscreen, toggleFullscreen } as const;
}



