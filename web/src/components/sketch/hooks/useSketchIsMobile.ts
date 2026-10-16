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

/**
 * Editor width below which the docked assistant squeezes the canvas: the tool
 * column, the 260 px right column, the assistant dock's default 340 px and
 * about 480 px of canvas. A workspace side panel (Chats, Assets) can take the
 * editor below this on a 1440 px screen.
 */
export const SKETCH_ASSISTANT_DOCK_MIN_EDITOR_WIDTH = 1120;

/** True once the measured editor is too narrow for the docked assistant. */
export function useSketchAssistantCramped(
  containerRef: RefObject<HTMLElement | null>
): boolean {
  const [cramped, setCramped] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      // Hidden workspace tabs report zero. Keep their last layout until shown.
      if (entry.contentRect.width > 0) {
        setCramped(
          entry.contentRect.width < SKETCH_ASSISTANT_DOCK_MIN_EDITOR_WIDTH
        );
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef]);

  return cramped;
}
