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

export function previewBackingSize(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
  scale: number
): { width: number; height: number } {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
    ? devicePixelRatio
    : 1;
  const pixelScale = dpr * scale;
  return {
    width: Math.max(1, Math.floor(cssWidth * pixelScale)),
    height: Math.max(1, Math.floor(cssHeight * pixelScale))
  };
}
