export type PreviewQuality = "auto" | "full" | "half" | "quarter";

/** Auto is deterministic: 4K sequences render at half resolution, others full. */
export function previewQualityScale(
  quality: PreviewQuality,
  sequenceWidth: number,
  sequenceHeight: number,
  isPlaying = true
): number {
  if (quality === "full") return 1;
  if (quality === "half") return 0.5;
  if (quality === "quarter") return 0.25;
  if (!isPlaying) return 1;
  return sequenceWidth >= 3840 || sequenceHeight >= 2160 ? 0.5 : 1;
}

/**
 * The preview canvas's pixel size. Display pixels are capped at the sequence
 * resolution before the quality scale applies. The export renders at sequence
 * size and text and shapes rasterize at it, so more pixels add no detail.
 * Without the cap, a fullscreen preview on a 2x display composites every pass
 * at up to four times the pixels of the sequence.
 */
export function previewBackingSize(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
  scale: number,
  sequenceWidth = Number.POSITIVE_INFINITY,
  sequenceHeight = Number.POSITIVE_INFINITY
): { width: number; height: number } {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
    ? devicePixelRatio
    : 1;
  // The frame keeps the sequence aspect, so capping each axis keeps it too.
  const width = Math.min(cssWidth * dpr, sequenceWidth > 0 ? sequenceWidth : Number.POSITIVE_INFINITY);
  const height = Math.min(cssHeight * dpr, sequenceHeight > 0 ? sequenceHeight : Number.POSITIVE_INFINITY);
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale))
  };
}
