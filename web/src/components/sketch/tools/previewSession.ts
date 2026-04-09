/**
 * previewSession — shared preview-session lifecycle contract.
 *
 * Tools that provide live compositing preview (MoveTool, TransformTool,
 * selection-move) follow a common lifecycle:
 *
 *   1. **start()**  — capture baseline transform, begin preview
 *   2. **update()** — apply delta to transform, schedule recomposite
 *   3. **commit()** — persist transform to store, clear preview
 *   4. **cancel()** — revert to baseline, clear preview
 *   5. **clear()**  — cleanup refs (called on deactivate)
 *
 * This module provides:
 *   - `PreviewSession` interface — shared type contract
 *   - `createPreviewSession()` — factory for the common state machine
 *
 * Tool classes own their own `PreviewSession` instance and call methods
 * from their onDown/onMove/onUp/onActivate/onDeactivate handlers.
 */

import type { LayerTransform } from "../types";
import type { ToolContext } from "./types";

// ── Session state ─────────────────────────────────────────────────────────────

export interface PreviewSessionState {
  /** ID of the layer being previewed. */
  layerId: string | null;
  /** Transform captured at the start of the gesture. */
  baselineTransform: LayerTransform;
  /** The most recent transform applied during the gesture. */
  currentTransform: LayerTransform;
  /** Whether a gesture is in progress. */
  active: boolean;
}

// ── Session interface ─────────────────────────────────────────────────────────

export interface PreviewSession {
  /** Current session state (read-only snapshot). */
  readonly state: Readonly<PreviewSessionState>;

  /** Start a new preview gesture for the given layer. */
  start(ctx: ToolContext, layerId: string, baselineTransform: LayerTransform): void;

  /** Update the live preview transform. Does NOT commit to the store. */
  update(ctx: ToolContext, transform: LayerTransform): void;

  /** Commit the current preview to the store and end the gesture. */
  commit(ctx: ToolContext): void;

  /** Cancel the gesture and revert to the baseline. */
  cancel(ctx: ToolContext): void;

  /** Clear all session state (e.g. on tool deactivate). */
  clear(ctx: ToolContext): void;

  /** Whether the session has an active gesture. */
  isActive(): boolean;
}

// ── Default identity transform ────────────────────────────────────────────────

const IDENTITY_TRANSFORM: LayerTransform = { x: 0, y: 0 };

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a new PreviewSession instance.
 *
 * The session manages the start → update → commit/cancel lifecycle
 * and delegates to `ctx.setLayerTransformPreview` / `ctx.clearLayerTransformPreview`
 * for the compositing pipeline, and `ctx.onLayerTransformChange` for commits.
 */
export function createPreviewSession(): PreviewSession {
  const state: PreviewSessionState = {
    layerId: null,
    baselineTransform: { ...IDENTITY_TRANSFORM },
    currentTransform: { ...IDENTITY_TRANSFORM },
    active: false
  };

  return {
    get state() {
      return state;
    },

    start(ctx: ToolContext, layerId: string, baselineTransform: LayerTransform): void {
      // Clear any previous session for a different layer (even if inactive,
      // in case the tool was deactivated without calling clear).
      if (state.layerId && state.layerId !== layerId) {
        ctx.clearLayerTransformPreview?.(state.layerId);
      }

      state.layerId = layerId;
      state.baselineTransform = { ...baselineTransform };
      state.currentTransform = { ...baselineTransform };
      state.active = true;

      ctx.onStrokeStart();
    },

    update(ctx: ToolContext, transform: LayerTransform): void {
      if (!state.active || !state.layerId) {
        return;
      }
      state.currentTransform = { ...transform };
      ctx.setLayerTransformPreview?.(state.layerId, transform);
    },

    commit(ctx: ToolContext): void {
      if (!state.active || !state.layerId) {
        return;
      }
      const layerId = state.layerId;
      const transform = state.currentTransform;

      ctx.onLayerTransformChange?.(layerId, transform);
      ctx.clearLayerTransformPreview?.(layerId);

      state.active = false;
    },

    cancel(ctx: ToolContext): void {
      if (!state.active || !state.layerId) {
        return;
      }
      const layerId = state.layerId;

      ctx.clearLayerTransformPreview?.(layerId);

      state.active = false;
    },

    clear(ctx: ToolContext): void {
      if (state.layerId) {
        ctx.clearLayerTransformPreview?.(state.layerId);
      }
      state.layerId = null;
      state.baselineTransform = { ...IDENTITY_TRANSFORM };
      state.currentTransform = { ...IDENTITY_TRANSFORM };
      state.active = false;
    },

    isActive(): boolean {
      return state.active;
    }
  };
}
