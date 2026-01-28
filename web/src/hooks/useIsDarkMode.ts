import { useEffect, useState } from "react";

/**
 * Hook to detect if the application is in dark mode.
 * 
 * Uses MutationObserver to watch for changes to the document's classList,
 * providing reactive updates when the theme is toggled.
 * 
 * @returns true if dark mode is active, false otherwise
 * 
 * @example
 * ```typescript
 * const isDarkMode = useIsDarkMode();
 * 
 * if (isDarkMode) {
 *   console.log("Dark theme is active");
 * }
 * ```
 */
export const useIsDarkMode = () => {
  const [isDarkMode, setIsDarkMode] = useState(() =>
    document.documentElement.classList.contains("dark")
  );

  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === "class") {
          setIsDarkMode(document.documentElement.classList.contains("dark"));
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"]
    });

    return () => observer.disconnect();
  }, []);

  return isDarkMode;
};
