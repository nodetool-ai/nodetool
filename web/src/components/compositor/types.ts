/**
 * Shared types for the Compositor layer editor.
 */

import type { BlendMode } from "@nodetool-ai/gpu";
import type { LayerTransform2D } from "@nodetool-ai/gpu/webgpu";

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

/** Default transform placing a `w`×`h` layer's top-left at the canvas origin. */
export function defaultTransform(
  width: number,
  height: number
): LayerTransform2D {
  return { x: width / 2, y: height / 2, scaleX: 1, scaleY: 1, rotation: 0 };
}
