/**
 * ShotFrameOverlay — the frame of an AI render, drawn over the 3D viewport.
 *
 * Dims the part of the viewport that falls outside the chosen aspect ratio,
 * so what is inside the frame is exactly what the render receives.
 */
import { memo, useEffect, useRef, useState } from "react";
import { useTheme } from "@mui/material/styles";

import { Box, Caption, BORDER_RADIUS, SPACING, Z_INDEX, getSpacingPx } from "../ui_primitives";
import { frameRect, type ShotSettings } from "./aiRender";

interface ShotFrameOverlayProps {
  shot: ShotSettings;
  /** Short description of the shot, shown on the frame's corner. */
  label: string;
}

const ShotFrameOverlay = ({ shot, label }: ShotFrameOverlayProps) => {
  const theme = useTheme();
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const frame = frameRect(size.width, size.height, shot.aspect);
  const cropped = shot.aspect !== "viewport";

  return (
    <Box
      ref={ref}
      aria-hidden
      data-testid="shot-frame-overlay"
      sx={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: Z_INDEX.base }}
    >
      {size.width > 0 && (
        <Box
          sx={{
            position: "absolute",
            left: frame.x,
            top: frame.y,
            width: frame.width,
            height: frame.height,
            border: `1px solid ${theme.vars.palette.primary.main}`,
            // One spread shadow dims everything outside the frame.
            boxShadow: cropped ? `0 0 0 100vmax ${theme.vars.palette.c_scrim}` : "none"
          }}
        >
          <Caption
            sx={{
              position: "absolute",
              left: getSpacingPx(SPACING.xs),
              bottom: getSpacingPx(SPACING.xs),
              paddingInline: getSpacingPx(SPACING.xs),
              borderRadius: BORDER_RADIUS.sm,
              backgroundColor: theme.vars.palette.c_scrim,
              color: theme.vars.palette.common.white
            }}
          >
            {label}
          </Caption>
        </Box>
      )}
    </Box>
  );
};

export default memo(ShotFrameOverlay);
