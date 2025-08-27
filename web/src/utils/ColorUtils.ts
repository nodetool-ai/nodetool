import chroma from "chroma-js";

// Utility to detect CSS variable references (e.g. "var(--palette-primary-main)")
function isCssVar(color: string): boolean {
  return color.trim().startsWith("var(");
}

export function hexToRgba(hex: string, alpha: number): string {
  // Return transparent if the color is empty or undefined
  if (!hex) {
    return "transparent";
  }

  // If the supplied color is a CSS variable token we cannot compute the RGBA
  // value in JS because the browser resolves it at paint‐time. In this case
  // we return a CSS `rgb()` function that preserves the variable and embeds
  // the requested alpha value using the modern slash syntax: `rgb(var(--foo) / a)`.
  if (isCssVar(hex)) {
    return `rgb(${hex} / ${alpha})`;
  }

  try {
    const rgba = chroma(hex).alpha(alpha).rgba();
    return `rgba(${rgba[0]}, ${rgba[1]}, ${rgba[2]}, ${rgba[3]})`;
  } catch (err) {
    // Fallback: if chroma cannot parse the color, just return the original
    // string unchanged to avoid runtime errors.
    console.error("hexToRgba: unable to parse color", hex, err);
    return hex;
  }
}

export function darkenHexColor(hex: string, amount: number): string {
  if (isCssVar(hex)) return hex;

  return chroma(hex)
    .darken(amount / 100)
    .hex();
}

export function lightenHexColor(hex: string, amount: number): string {
  if (isCssVar(hex)) return hex;

  return chroma(hex)
    .brighten(amount / 100)
    .hex();
}

export function adjustSaturation(hex: string, amount: number): string {
  if (isCssVar(hex)) return hex;

  return chroma(hex)
    .set("hsl.s", `*${1 + amount / 100}`)
    .hex();
}

export function adjustHue(hex: string, amount: number): string {
  if (isCssVar(hex)) return hex;

  return chroma(hex).set("hsl.h", `+${amount}`).hex();
}

export function adjustLightness(hex: string, amount: number): string {
  if (isCssVar(hex)) return hex;

  return chroma(hex)
    .set("hsl.l", `*${1 + amount / 100}`)
    .hex();
}

type GradientDirection =
  | "to top"
  | "to bottom"
  | "to left"
  | "to right"
  | "to top left"
  | "to top right"
  | "to bottom left"
  | "to bottom right";

type GradientMode = "darken" | "lighten" | "saturate";

export function createLinearGradient(
  hexColor: string,
  amount: number,
  direction: GradientDirection = "to bottom",
  mode: GradientMode = "darken"
): string {
  const rgbaColor = hexToRgba(hexColor, 1);
  let modifiedHexColor;

  switch (mode) {
    case "darken":
      modifiedHexColor = darkenHexColor(hexColor, amount);
      break;
    case "lighten":
      modifiedHexColor = lightenHexColor(hexColor, amount);
      break;
    case "saturate":
      modifiedHexColor = adjustSaturation(hexColor, amount);
      break;
    default:
      modifiedHexColor = hexColor;
  }

  const rgbaModifiedColor = hexToRgba(modifiedHexColor, 1);
  return `linear-gradient(${direction}, ${rgbaColor}, ${rgbaModifiedColor})`;
}

export function simulateOpacity(
  hexColor: string,
  alpha: number,
  backgroundColor: string = "#fff"
): string {
  // If either color is provided as a CSS variable token, we cannot blend
  // it numerically. Just return the foreground color unchanged – the browser
  // will resolve the variable at paint‐time.
  if (isCssVar(hexColor) || isCssVar(backgroundColor)) {
    return hexColor;
  }

  const foregroundColor = chroma(hexColor);
  const bgColor = chroma(backgroundColor);

  const blendedColor = chroma.mix(bgColor, foregroundColor, alpha, "rgb");

  return blendedColor.hex();
}

/**
 * OKLCH helpers
 */
export function parseOklch(
  value: string
): { l: number; c: number; h: number } | null {
  const str = value.trim().toLowerCase();
  if (!str.startsWith("oklch(")) return null;
  const match =
    /^oklch\(\s*([0-9]*\.?[0-9]+%?)\s+([0-9]*\.?[0-9]+)\s+([0-9]*\.?[0-9]+)\s*\)$/i.exec(
      str
    );
  if (!match) return null;
  const lRaw = match[1];
  const c = parseFloat(match[2]);
  const h = parseFloat(match[3]);
  let l: number;
  if (lRaw.endsWith("%")) {
    l = Math.max(0, Math.min(1, parseFloat(lRaw.slice(0, -1)) / 100));
  } else {
    l = Math.max(0, Math.min(1, parseFloat(lRaw)));
  }
  if (Number.isNaN(l) || Number.isNaN(c) || Number.isNaN(h)) return null;
  return { l, c, h };
}

export function hexToRgb(
  hex: string
): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      }
    : null;
}

export function getLuminance({
  r,
  g,
  b
}: {
  r: number;
  g: number;
  b: number;
}): number {
  const a = [r, g, b].map(function (v) {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

export function stableHash(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
  }
  return hash | 0;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function generateOKLCHFromSlug(
  slug: string,
  opts?: {
    anchorH?: number;
    anchorC?: number;
    baseL?: number;
    neutralExecution?: boolean;
    spreadDeg?: number;
    cJitter?: number;
    lJitter?: number;
    lMin?: number;
    lMax?: number;
    cMin?: number;
    cMax?: number;
  }
): string {
  const h = stableHash(slug);
  const jitterUnit = ((h >>> 8) % 2000) / 1000 - 1; // [-1, 1]

  const hasAnchor =
    opts && (opts.anchorH !== undefined || opts.anchorC !== undefined);
  const baseL = opts?.baseL ?? 0.72;

  const spread = opts?.neutralExecution ? 0 : opts?.spreadDeg ?? 16;
  const cJitter = opts?.neutralExecution ? 0 : opts?.cJitter ?? 0.025;
  const lJitter = opts?.neutralExecution ? 0.015 : opts?.lJitter ?? 0.02;
  const lMin = opts?.lMin ?? 0.58;
  const lMax = opts?.lMax ?? 0.88;
  const cMin = opts?.cMin ?? 0.06;
  const cMax = opts?.cMax ?? 0.22;

  if (hasAnchor) {
    const l = clamp(baseL + lJitter * jitterUnit, lMin, lMax);
    const hue =
      ((((opts?.anchorH ?? 0) + spread * jitterUnit) % 360) + 360) % 360;
    const chroma = clamp(
      (opts?.anchorC ?? 0.14) + cJitter * jitterUnit,
      cMin,
      cMax
    );
    return `oklch(${round2(l)} ${round2(chroma)} ${round2(hue)})`;
  }

  const baseC = 0.14;
  const hue = ((h % 360) + 360) % 360;
  const chroma = clamp(baseC + jitterUnit * cJitter, cMin, cMax);
  const l = clamp(baseL + lJitter * jitterUnit, lMin, lMax);
  return `oklch(${round2(l)} ${round2(chroma)} ${round2(hue)})`;
}
