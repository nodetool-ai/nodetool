/**
 * painting/ — barrel export for the transform-aware paint session model.
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

// ── Shared stabiliser ───────────────────────────────────────────────────────
export { StabilizerBuffer } from "./StabilizerBuffer";
export { StrokeAssist } from "./StrokeAssist";

// ── Coordinate mapping ─────────────────────────────────────────────────────
export { CoordinateMapper } from "./CoordinateMapper";
export type { CoordinateMapperConfig } from "./CoordinateMapper";

// ── Document sampling / hit-testing ────────────────────────────────────────
export {
  sampleCompositeColor,
  sampleCompositeRGBA,
  hitTestLayerAtDocPoint
} from "./sampleDocument";

// ── Alpha-lock save/restore ────────────────────────────────────────────────
export {
  captureAlphaSnapshot,
  restoreAlphaFromSnapshot
} from "./alphaLock";
export type { AlphaRestoreDirtyRect } from "./alphaLock";

// ── Helper-tool session (clone stamp, blur, etc.) ──────────────────────────
export { HelperToolSession } from "./HelperToolSession";
export type {
  HelperOnSetup,
  HelperOnDraw,
  HelperOnTeardown,
  HelperSetupInfo,
  HelperDrawInfo
} from "./HelperToolSession";

// ── Transform preview contract ─────────────────────────────────────────────
export {
  mergeTransformPreview,
  applyTransformPreviews,
  createMovePreview,
  isCompleteTransform
} from "./transformPreview";
