/**
 * Runtime Slice — registers the active rendering runtime so non-React code
 * (slices, action handlers) can reach GPU-only operations without prop
 * drilling.
 *
 * The runtime instance lives in `useCanvasOrchestration`; it registers
 * itself on mount and unregisters on unmount. Consumers that need a
 * GPU-only API (e.g. `featherSelectionGpu`) should feature-detect before
 * calling, since the slot may be `null` (no runtime yet) or hold a runtime
 * that does not implement the method (e.g. Canvas2D fallback).
 *
 * The slot is intentionally NOT part of any persisted state — it holds a
 * mutable runtime object whose lifetime is tied to the editor mount.
 */

import type { StateCreator } from "zustand";
import type { SketchStore } from "../useSketchStore";
import type { SketchRuntime } from "../../rendering/types";

export interface RuntimeSlice {
  /** Active rendering runtime. `null` until orchestration registers one. */
  runtime: SketchRuntime | null;
  /**
   * Used by `useCanvasOrchestration` to publish / unpublish the runtime.
   * Not intended for app code — call sites should consume `runtime` directly.
   */
  setRuntimeInstance: (rt: SketchRuntime | null) => void;
}

export const createRuntimeSlice: StateCreator<
  SketchStore,
  [],
  [],
  RuntimeSlice
> = (set) => ({
  runtime: null,
  setRuntimeInstance: (rt) => set({ runtime: rt })
});
