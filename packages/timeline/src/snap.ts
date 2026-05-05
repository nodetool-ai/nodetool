export function snap(
  timeMs: number,
  candidates: number[],
  thresholdPx: number,
  msPerPx: number
): number {
  const thresholdMs = thresholdPx * msPerPx;

  let closest = timeMs;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const distance = Math.abs(candidate - timeMs);
    if (distance > thresholdMs) {
      continue;
    }

    if (distance < closestDistance) {
      closest = candidate;
      closestDistance = distance;
      continue;
    }

    if (distance === closestDistance && candidate < closest) {
      closest = candidate;
    }
  }

  return closest;
}
