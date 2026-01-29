export const DEFAULT_PIXI_BACKGROUND = "#ffffff";

export const parseHexColor = (color?: string, fallback = DEFAULT_PIXI_BACKGROUND): number => {
  const normalized = (color ?? fallback).replace("#", "");
  const parsed = Number.parseInt(normalized, 16);
  return Number.isNaN(parsed) ? Number.parseInt(fallback.replace("#", ""), 16) : parsed;
};

export const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
