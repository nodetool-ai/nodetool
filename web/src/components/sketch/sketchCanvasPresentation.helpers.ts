import type { CSSProperties } from "react";
import type { Point } from "./types";

export function canvasTransformStyle(pan: Point, zoom: number): CSSProperties {
  return {
    transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
    transformOrigin: "center center",
    imageRendering: "pixelated"
  };
}
