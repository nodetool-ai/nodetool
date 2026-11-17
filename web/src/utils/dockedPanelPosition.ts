/**
 * Position of a floating panel that the user can drag over the canvas.
 *
 * The panel stores its distance from the nearest horizontal and vertical edge
 * of the free canvas area, not an absolute point. A panel dropped near the
 * right edge stays at the right edge when the window widens, and a panel
 * docked at the bottom grows upward when it expands. The native node editor
 * keeps the same model in `native/node-editor/src/ui/DockedOverlay.h`.
 */

export type HorizontalAnchor = "left" | "right";
export type VerticalAnchor = "top" | "bottom";

export interface DockedPosition {
  anchorX: HorizontalAnchor;
  anchorY: VerticalAnchor;
  /** Distance in px from the anchored horizontal edge of the area. */
  x: number;
  /** Distance in px from the anchored vertical edge of the area. */
  y: number;
}

/** The free canvas area in viewport px. */
export interface PanelArea {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface PanelSize {
  width: number;
  height: number;
}

export interface PanelPoint {
  left: number;
  top: number;
}

/** Gap kept between a panel and the edges of the area. */
export const DOCKED_PANEL_MARGIN = 16;

/** The top-left corner of the free canvas area. */
export const DEFAULT_DOCKED_POSITION: DockedPosition = {
  anchorX: "left",
  anchorY: "top",
  x: DOCKED_PANEL_MARGIN,
  y: DOCKED_PANEL_MARGIN
};

const clampAxis = (value: number, min: number, max: number): number =>
  // A panel larger than the area pins to the leading edge so its header stays reachable.
  Math.max(min, Math.min(value, Math.max(min, max)));

/**
 * The panel's top-left point inside `area`, clamped so the whole panel stays
 * at least `DOCKED_PANEL_MARGIN` from every edge.
 */
export function placeDockedPanel(
  position: DockedPosition,
  area: PanelArea,
  size: PanelSize
): PanelPoint {
  const left =
    position.anchorX === "left"
      ? area.left + position.x
      : area.right - position.x - size.width;
  const top =
    position.anchorY === "top"
      ? area.top + position.y
      : area.bottom - position.y - size.height;
  const m = DOCKED_PANEL_MARGIN;
  return {
    left: clampAxis(left, area.left + m, area.right - m - size.width),
    top: clampAxis(top, area.top + m, area.bottom - m - size.height)
  };
}

/**
 * The docked position for a panel whose top-left is at `point`. Each axis
 * anchors to the edge nearer the panel's centre.
 */
export function dockPanelAt(
  point: PanelPoint,
  area: PanelArea,
  size: PanelSize
): DockedPosition {
  const placed = placeDockedPanel(
    { anchorX: "left", anchorY: "top", x: point.left - area.left, y: point.top - area.top },
    area,
    size
  );
  const centerX = placed.left + size.width / 2;
  const centerY = placed.top + size.height / 2;
  const anchorX: HorizontalAnchor =
    centerX <= (area.left + area.right) / 2 ? "left" : "right";
  const anchorY: VerticalAnchor =
    centerY <= (area.top + area.bottom) / 2 ? "top" : "bottom";
  return {
    anchorX,
    anchorY,
    x: Math.round(
      anchorX === "left"
        ? placed.left - area.left
        : area.right - placed.left - size.width
    ),
    y: Math.round(
      anchorY === "top"
        ? placed.top - area.top
        : area.bottom - placed.top - size.height
    )
  };
}

/** Reads a stored position, or null when the value is missing or malformed. */
export function parseDockedPosition(value: unknown): DockedPosition | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const { anchorX, anchorY, x, y } = record;
  if (
    (anchorX !== "left" && anchorX !== "right") ||
    (anchorY !== "top" && anchorY !== "bottom") ||
    typeof x !== "number" ||
    typeof y !== "number" ||
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  ) {
    return null;
  }
  return { anchorX, anchorY, x: Math.max(0, x), y: Math.max(0, y) };
}
