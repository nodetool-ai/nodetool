/**
 * Shared types for the Compositor layer editor.
 */

import type { BlendMode } from "@nodetool-ai/gpu";
import {
  defaultLayerTransform,
  type LayerTransform2D
} from "@nodetool-ai/gpu/webgpu";

export type { LayerTransform2D };

/** One layer as the editor sees it (positional order = stacking order). */
export interface CompositorEditorLayer {
  /** The `image_N` dynamic-property key. */
  id: string;
  /** Resolved image URL for preview/thumbnail, if wired. */
  url?: string;
  opacity: number;
  blendMode: BlendMode;
  visible: boolean;
  transform?: LayerTransform2D;
}

/** Contain-fit, centered default for a layer with no explicit transform. */
export function defaultTransform(
  layerWidth: number,
  layerHeight: number,
  canvasWidth: number,
  canvasHeight: number
): LayerTransform2D {
  return defaultLayerTransform(
    layerWidth,
    layerHeight,
    canvasWidth,
    canvasHeight
  );
}
