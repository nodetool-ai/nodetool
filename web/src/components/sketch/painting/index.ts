/**
 * painting/ — shared paint architecture (Phase 4).
 *
 * Barrel export for the transform-aware paint session model.
 */

// ── Core session ────────────────────────────────────────────────────────────
export { PaintSession } from "./PaintSession";
export type { PaintSessionSnapshot } from "./PaintSession";

// ── Engine interface & types ────────────────────────────────────────────────
export type {
  PaintEngine,
  EngineCompositeOp,
  StrokeBufferMode
} from "./PaintEngine";

// ── Concrete engines ────────────────────────────────────────────────────────
export { BrushEngine } from "./BrushEngine";
export { PencilEngine } from "./PencilEngine";
export { EraserEngine } from "./EraserEngine";

// ── Coordinate mapping ─────────────────────────────────────────────────────
export { CoordinateMapper } from "./CoordinateMapper";
export type { CoordinateMapperConfig } from "./CoordinateMapper";
