/**
 * MediaLabel
 *
 * A small readout on top of an image, video or thumbnail: dimensions,
 * duration, a format tag. White mono caption on the standard scrim
 * (`c_scrim`, which stays dark in both themes, DESIGN.md "Scrims & Surface
 * Overlays"). With `corner` it pins itself to that corner of the nearest
 * positioned ancestor and ignores pointer events so the media stays usable.
 *
 * @example
 * <MediaLabel corner="bottom-right">{width} × {height}</MediaLabel>
 */

import { forwardRef } from "react";
import { Box } from "./Box";
import type { BoxProps } from "./Box";
import { SPACING, getSpacingPx } from "./spacing";
import { BORDER_RADIUS, TYPOGRAPHY } from "./tokens";

export type MediaLabelCorner =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export interface MediaLabelProps extends BoxProps {
  /** Pin to a corner of the positioned parent. Without it the label flows inline. */
  corner?: MediaLabelCorner;
}

const EDGE = getSpacingPx(SPACING.micro);

const CORNER_POSITION: Record<MediaLabelCorner, Record<string, string>> = {
  "top-left": { top: EDGE, left: EDGE },
  "top-right": { top: EDGE, right: EDGE },
  "bottom-left": { bottom: EDGE, left: EDGE },
  "bottom-right": { bottom: EDGE, right: EDGE }
};

export const MediaLabel = forwardRef<HTMLSpanElement, MediaLabelProps>(
  ({ corner, sx, children, ...props }, ref) => (
    <Box
      ref={ref}
      component="span"
      sx={[
        {
          display: "inline-block",
          px: SPACING.xs,
          py: SPACING.micro,
          bgcolor: (theme) => theme.vars.palette.c_scrim,
          color: "common.white",
          ...TYPOGRAPHY.mono.caption,
          borderRadius: BORDER_RADIUS.sm,
          whiteSpace: "nowrap"
        },
        corner
          ? { position: "absolute", pointerEvents: "none", ...CORNER_POSITION[corner] }
          : false,
        ...(Array.isArray(sx) ? sx : [sx])
      ]}
      {...props}
    >
      {children}
    </Box>
  )
);

MediaLabel.displayName = "MediaLabel";
