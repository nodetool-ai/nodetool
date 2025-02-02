"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

export function ColorModeSync() {
  const { theme, setTheme, resolvedTheme } = useTheme();

  useEffect(() => {
    if (resolvedTheme) {
      setTheme(resolvedTheme);
    }
  }, [resolvedTheme, setTheme]);

  return null;
}
