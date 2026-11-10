/** sRGB exposure with a hue-preserving highlight shoulder and a black-point offset, before output clipping. */
export function exposeRgb(
  rgb: readonly [number, number, number], exposure = 0, rolloff = 0, whites = 0, blacks = 0
): [number, number, number] {
  const decode = (v: number): number => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  const encode = (v: number): number => v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  const r = decode(rgb[0]), g = decode(rgb[1]), b = decode(rgb[2]);
  const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const t = Math.max(0, Math.min(1, (luminance - 0.25) / 0.75));
  let gain = Math.pow(2, Math.max(-5, Math.min(5, exposure)))
    * (1 + (Math.pow(2, Math.max(-2, Math.min(2, whites))) - 1) * t * t * (3 - 2 * t));
  const strength = Math.max(0, Math.min(1, rolloff));
  const knee = 1 - 0.75 * strength;
  const peak = Math.max(r, g, b) * gain;
  if (strength > 0 && peak > knee) {
    gain *= (knee + (1 - knee) * (1 - Math.exp(-(peak - knee) / (1 - knee)))) / peak;
  }
  const lift = Math.max(-1, Math.min(1, blacks)) * 0.15;
  const black = (v: number): number => v + lift * Math.pow(1 - Math.max(0, Math.min(1, v)), 3);
  return [black(encode(r * gain)), black(encode(g * gain)), black(encode(b * gain))];
}
