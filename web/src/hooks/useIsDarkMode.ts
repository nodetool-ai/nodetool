import { useEffect, useState } from "react";

/** Tracks whether dark mode is active by observing the `dark` class on the document root. */
export const useIsDarkMode = (): boolean => {
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
