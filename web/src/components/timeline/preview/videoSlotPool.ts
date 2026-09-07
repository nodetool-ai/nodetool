/**
 * Which `<video>` element in the pool decodes which asset.
 *
 * A slot holds one decoded asset, and a matted clip asks for two: its picture
 * and the luma mask cut from the same source, both carrying the same clip id
 * (`generatedMatte`, D2). Keying a slot by the clip id alone bound both to one
 * element, so whichever was written last won and the compositor read the
 * picture where it wanted the mask. A slot is therefore keyed by the pair —
 * one clip's picture and its matte are different assets, so they are different
 * slots — while the binding keeps the real clip id, because the seek math
 * (speed, in-point, time remap) is the clip's, not the asset's.
 */

/** The clip/asset pair a slot decodes. */
export interface VideoSlotRequest {
  clipId: string;
  assetUrl: string;
}

/** What a bound slot holds: its pool index and the clip whose clock drives it. */
export interface VideoSlotBinding {
  index: number;
  clipId: string;
}

/** The pool key for one clip's use of one asset. */
export function videoSlotKey(clipId: string, assetUrl: string): string {
  return `${clipId}:${assetUrl}`;
}

/**
 * Bind every active request to a hot-pool slot, in place.
 *
 * Existing bindings are kept — an element that already decodes the right asset
 * must not be reloaded when a neighbouring clip ends — bindings whose request
 * is gone are dropped, and what is left over is filled from the free slots.
 * Returns the indices in use, so the caller can idle the rest.
 */
export function bindVideoSlots(
  active: readonly VideoSlotRequest[],
  bindings: Map<string, VideoSlotBinding>,
  hotPoolSize: number
): Set<number> {
  const activeKeys = new Set(
    active.map((slot) => videoSlotKey(slot.clipId, slot.assetUrl))
  );
  for (const key of [...bindings.keys()]) {
    if (!activeKeys.has(key)) {
      bindings.delete(key);
    }
  }

  const used = new Set<number>();
  for (const binding of bindings.values()) {
    used.add(binding.index);
  }

  for (const slot of active) {
    const key = videoSlotKey(slot.clipId, slot.assetUrl);
    if (bindings.has(key)) {
      continue;
    }
    for (let i = 0; i < hotPoolSize; i++) {
      if (used.has(i)) {
        continue;
      }
      bindings.set(key, { index: i, clipId: slot.clipId });
      used.add(i);
      break;
    }
  }
  return used;
}
