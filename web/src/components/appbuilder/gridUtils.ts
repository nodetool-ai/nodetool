/** Pixel <-> grid-unit conversions for the app layout grid. */
import { AppGridConfig, Widget, WidgetLayout } from "./appSchema";

export interface PixelRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const cellWidth = (containerWidth: number, grid: AppGridConfig): number => {
  const totalGap = grid.gap * (grid.cols - 1);
  return Math.max(1, (containerWidth - totalGap) / grid.cols);
};

export const layoutToPixels = (
  layout: WidgetLayout,
  containerWidth: number,
  grid: AppGridConfig
): PixelRect => {
  const cw = cellWidth(containerWidth, grid);
  return {
    left: layout.x * (cw + grid.gap),
    top: layout.y * (grid.rowHeight + grid.gap),
    width: layout.w * cw + (layout.w - 1) * grid.gap,
    height: layout.h * grid.rowHeight + (layout.h - 1) * grid.gap
  };
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/** Snap a pixel position to the nearest grid cell, clamped to the grid. */
export const pixelToGridPosition = (
  left: number,
  top: number,
  layout: WidgetLayout,
  containerWidth: number,
  grid: AppGridConfig
): { x: number; y: number } => {
  const cw = cellWidth(containerWidth, grid);
  const x = Math.round(left / (cw + grid.gap));
  const y = Math.round(top / (grid.rowHeight + grid.gap));
  return {
    x: clamp(x, 0, grid.cols - layout.w),
    y: Math.max(0, y)
  };
};

/** Snap a pixel size to whole grid cells, clamped within the grid. */
export const pixelToGridSize = (
  width: number,
  height: number,
  layout: WidgetLayout,
  containerWidth: number,
  grid: AppGridConfig
): { w: number; h: number } => {
  const cw = cellWidth(containerWidth, grid);
  const w = Math.round((width + grid.gap) / (cw + grid.gap));
  const h = Math.round((height + grid.gap) / (grid.rowHeight + grid.gap));
  return {
    w: clamp(w, 1, grid.cols - layout.x),
    h: Math.max(1, h)
  };
};

/** Total grid rows occupied — used to size the canvas/runtime container. */
export const gridRows = (widgets: Widget[]): number =>
  widgets.reduce((max, w) => Math.max(max, w.layout.y + w.layout.h), 0);

export const canvasHeight = (widgets: Widget[], grid: AppGridConfig): number => {
  const rows = gridRows(widgets);
  return rows * (grid.rowHeight + grid.gap);
};
