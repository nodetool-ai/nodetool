/**
 * DockDropOverlay
 *
 * The preview a docking drag draws over the group under the pointer: the part
 * of the group the dragged panel will take once it is dropped. `center` adds
 * the panel to the group as a tab and fills the group. An edge splits the
 * group and fills that half.
 *
 * `dockZoneAt` picks the zone from the pointer position, so every dock host
 * splits a group at the same distances from its edges.
 *
 * The overlay ignores the pointer. Place it inside a positioned container.
 */

import { forwardRef, memo } from "react";
import { useTheme } from "@mui/material/styles";

import { Box } from "./Box";
import { BORDER_RADIUS, MOTION, Z_INDEX, reducedMotion } from "./tokens";
import { SPACING } from "./spacing";

export type DockZone = "center" | "top" | "bottom" | "left" | "right";

/** Fraction of a group's width or height, from an edge, that splits it on drop. */
export const DOCK_EDGE_FRACTION = 0.28;

export interface DockRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The zone a drop at (`x`, `y`) lands in. The nearest allowed edge wins
 * inside {@link DOCK_EDGE_FRACTION} of it, and the rest of the group is
 * `center`. Returns null outside the rectangle.
 */
export function dockZoneAt(rect: DockRect, x: number, y: number, allowed: readonly DockZone[]): DockZone | null {
  if (rect.width <= 0 || rect.height <= 0) { return null; }
  const fx = (x - rect.left) / rect.width;
  const fy = (y - rect.top) / rect.height;
  if (fx < 0 || fx > 1 || fy < 0 || fy > 1) { return null; }
  const distances: ReadonlyArray<readonly [DockZone, number]> = [["left", fx], ["right", 1 - fx], ["top", fy], ["bottom", 1 - fy]];
  let best: DockZone | null = null;
  let bestDistance = DOCK_EDGE_FRACTION;
  for (const [zone, distance] of distances) {
    if (allowed.includes(zone) && distance < bestDistance) { best = zone; bestDistance = distance; }
  }
  if (best) { return best; }
  return allowed.includes("center") ? "center" : null;
}

const ZONE_INSET: Record<DockZone, { top: string; right: string; bottom: string; left: string }> = {
  center: { top: "0%", right: "0%", bottom: "0%", left: "0%" },
  top: { top: "0%", right: "0%", bottom: "50%", left: "0%" },
  bottom: { top: "50%", right: "0%", bottom: "0%", left: "0%" },
  left: { top: "0%", right: "50%", bottom: "0%", left: "0%" },
  right: { top: "0%", right: "0%", bottom: "0%", left: "50%" }
};

export interface DockDropOverlayProps {
  /** The zone to preview. Nothing renders while it is null. */
  zone: DockZone | null;
}

const DockDropOverlayBase = forwardRef<HTMLDivElement, DockDropOverlayProps>(function DockDropOverlay({ zone }, ref) {
  const theme = useTheme();
  if (!zone) { return null; }
  const inset = ZONE_INSET[zone];
  return <Box ref={ref} aria-hidden data-dock-drop-zone={zone} sx={{
    position: "absolute", ...inset, pointerEvents: "none", zIndex: Z_INDEX.overlay,
    m: SPACING.micro, borderRadius: BORDER_RADIUS.sm,
    border: `1px solid ${theme.vars.palette.primary.main}`,
    bgcolor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.18)`,
    transition: `top ${MOTION.fast}, right ${MOTION.fast}, bottom ${MOTION.fast}, left ${MOTION.fast}`,
    ...reducedMotion({ transition: MOTION.none })
  }} />;
});

export const DockDropOverlay = memo(DockDropOverlayBase);
DockDropOverlay.displayName = "DockDropOverlay";
