/** Snap dimensions to the constraints shared by GPT Image 2 and 2.5. */
export function snapToGptImage2Size(
  width: number,
  height: number
): [number, number] | null {
  const MIN_AREA = 655_360;
  const MAX_AREA = 8_294_400;
  const MAX_EDGE = 3840;
  const MAX_RATIO = 3;

  if (!(width > 0) || !(height > 0)) return null;

  const landscape = width >= height;
  const ratio = Math.min(
    MAX_RATIO,
    landscape ? width / height : height / width
  );
  const area = Math.min(MAX_AREA, Math.max(MIN_AREA, width * height));
  let long = Math.sqrt(area * ratio);
  let short = long / ratio;
  if (long > MAX_EDGE) {
    short *= MAX_EDGE / long;
    long = MAX_EDGE;
  }

  const snap = (value: number): number =>
    Math.min(MAX_EDGE, Math.max(16, Math.round(value / 16) * 16));
  let longPx = snap(long);
  let shortPx = snap(short);

  while (longPx * shortPx < MIN_AREA && longPx + 16 <= MAX_EDGE) {
    longPx += 16;
    shortPx = snap(longPx / ratio);
  }
  while (longPx * shortPx > MAX_AREA && longPx - 16 >= 16) {
    longPx -= 16;
    shortPx = snap(longPx / ratio);
  }
  if (longPx / shortPx > MAX_RATIO) {
    shortPx = Math.min(longPx, Math.ceil(longPx / MAX_RATIO / 16) * 16);
  }

  const areaPx = longPx * shortPx;
  if (areaPx < MIN_AREA || areaPx > MAX_AREA) return null;
  return landscape ? [longPx, shortPx] : [shortPx, longPx];
}
