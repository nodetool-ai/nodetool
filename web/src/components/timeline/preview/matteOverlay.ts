/**
 * "Show matte": look at the mask instead of the shot it cuts.
 *
 * A generated matte is a luma video the compositor never draws on its own — it
 * only reaches the frame as the keyhole on its clip's picture. So the only way
 * to judge one is to draw it, and the cheapest way to draw exactly what the
 * keyhole reads is to hand the compositor the matte's own layer, unmatted, in
 * place of the frame: same clip, same placement, same source time, no keyhole.
 * A luma mask is already grayscale, so nothing else has to change.
 */

import type { ActiveLayer } from "@nodetool-ai/timeline/render";

/**
 * The frame to draw while the matte view is on: the selected clip's matte
 * layer alone, or `layers` unchanged when there is nothing to look at (no
 * selection, the clip is not at the playhead, or its matte is still
 * generating — the scene model only attaches a `ready` one).
 */
export function matteOnlyLayers(
  layers: ActiveLayer[],
  clipId: string | null
): ActiveLayer[] {
  if (!clipId) {
    return layers;
  }
  const matted = layers.find(
    (layer) => layer.clipId === clipId && layer.matte !== undefined
  );
  const source = matted?.matte?.layer;
  return source ? [source] : layers;
}
