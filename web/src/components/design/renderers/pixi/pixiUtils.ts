export const DEFAULT_PIXI_BACKGROUND = "#ffffff";

export const parseHexColor = (color?: string, fallback = DEFAULT_PIXI_BACKGROUND): number => {
  const normalized = (color ?? fallback).replace("#", "");
  const parsed = Number.parseInt(normalized, 16);
  return Number.isNaN(parsed) ? Number.parseInt(fallback.replace("#", ""), 16) : parsed;
};

export const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

export const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max);
};

export const snapToGrid = (value: number, gridSize: number): number => {
  if (gridSize <= 0) {
    return value;
  }
  return Math.round(value / gridSize) * gridSize;
};

export const snapToIncrement = (value: number, increment: number): number => {
  if (increment <= 0) {
    return value;
  }
  return Math.round(value / increment) * increment;
};

export const normalizeAngle = (degrees: number): number => {
  const normalized = degrees % 360;
  return normalized < 0 ? normalized + 360 : normalized;
};

export const lerp = (start: number, end: number, t: number): number => {
  return start + (end - start) * t;
};

export const roundToDecimal = (value: number, places: number): number => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};
