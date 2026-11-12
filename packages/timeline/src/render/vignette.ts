/**
 * Distance of a centered position (each axis -1..1 across the frame) from the
 * vignette center. Roundness 0 is the frame-shaped oval, 1 a circle against the
 * shorter axis, and -1 a superellipse of exponent 8, a rounded rectangle.
 */
export function vignetteDistance(dx: number, dy: number, width: number, height: number, roundness: number): number {
  const round = Math.max(0, Math.min(1, roundness)), square = Math.max(0, Math.min(1, -roundness));
  const shortAxis = Math.min(width, height);
  const x = Math.abs(dx * (1 + round * (width / shortAxis - 1))), y = Math.abs(dy * (1 + round * (height / shortAxis - 1)));
  if (square === 0) { return Math.hypot(x, y); }
  const power = 2 + 6 * square;
  return Math.pow(Math.pow(x, power) + Math.pow(y, power), 1 / power);
}
