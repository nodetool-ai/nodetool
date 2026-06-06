export interface SnapResolution {
  /** The final time value (snapped or original). */
  value: number;
  /** Whether a snap actually occurred. */
  snapped: boolean;
  /** Distance from the original time to the snap target in ms. */
  distanceMs: number;
  /** Distance from the original time to the snap target in px. */
  distancePx: number;
}

/**
 * Resolve the closest snap candidate to `timeMs` within a pixel threshold.
 *
 * Returns the snapped value plus metadata (whether snapping occurred and
 * the distance in both ms and px). This is the richer cousin of the
 * legacy `snap()` function exported from `../snap.js`.
 */
export function resolveSnap(
  timeMs: number,
  candidates: number[],
  thresholdPx: number,
  msPerPx: number
): SnapResolution {
  const thresholdMs = thresholdPx * msPerPx;

  let closest = timeMs;
  let closestDistance = Number.POSITIVE_INFINITY;
  // Tracks whether any candidate fell within the threshold and was adopted —
  // distinct from `closest !== timeMs`, which would miss the case where the
  // closest snap target lies exactly on `timeMs`.
  let snapped = false;

  for (const candidate of candidates) {
    const distance = Math.abs(candidate - timeMs);
    if (distance > thresholdMs) {
      continue;
    }

    if (distance < closestDistance) {
      closest = candidate;
      closestDistance = distance;
      snapped = true;
      continue;
    }

    if (distance === closestDistance && candidate < closest) {
      closest = candidate;
    }
  }

  const distanceMs = Math.abs(closest - timeMs);

  return {
    value: closest,
    snapped,
    distanceMs,
    distancePx: msPerPx > 0 ? distanceMs / msPerPx : 0,
  };
}
