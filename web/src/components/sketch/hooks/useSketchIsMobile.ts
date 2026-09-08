import { useEffect, useState, type RefObject } from "react";
import { useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";

/** Move side panels into sheets when the editor cannot fit both docks and a canvas. */
export function useSketchIsMobile(
  containerRef?: RefObject<HTMLElement | null>
): boolean {
  const theme = useTheme();
  const narrowViewport = useMediaQuery(theme.breakpoints.down("md"));
  const [narrowContainer, setNarrowContainer] = useState<boolean | null>(null);

  useEffect(() => {
    const container = containerRef?.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      // Hidden workspace tabs report zero. Keep their last layout until shown.
      if (entry.contentRect.width > 0) {
        setNarrowContainer(
          entry.contentRect.width < theme.breakpoints.values.md
        );
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, theme.breakpoints.values.md]);

  return narrowContainer ?? narrowViewport;
}
