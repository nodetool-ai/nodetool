/**
 * Self-contained color math, replacing the `chroma-js` operations used in the
 * app. Algorithms mirror chroma-js 3.x exactly so colors stay visually
 * identical:
 *  - darken/brighten operate in CIE Lab (L channel, step = 18 per unit)
 *  - desaturate/saturate operate in CIE Lch (C channel, step = 18 per unit)
 *  - Lab uses the D65 white point with Bradford chromatic adaptation, matching
 *    chroma's `rgb2lab`/`lab2rgb` matrices
 *  - mix interpolates linearly per RGB channel ("rgb" mode)
 *  - hsl saturation multiplier replicates `.set("hsl.s", "*factor")`
 *  - luminance is the WCAG relative-luminance definition
 *
 * Internal color representation is { r, g, b, a } with r/g/b in 0..255 and
 * a in 0..1.
 */

export interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

// chroma-js LAB_CONSTANTS — Kn is the per-unit step for darken/desaturate.
const Kn = 18;

// D65 standard referent (chroma RefWhiteRGB / Xn,Yn,Zn).
const Xn = 0.95047;
const Yn = 1;
const Zn = 1.08883;

const kE = 216.0 / 24389.0;
const kK = 24389.0 / 27.0;
const kKE = 8.0;

// sRGB → XYZ (chroma MtxRGB2XYZ).
const MtxRGB2XYZ = {
  m00: 0.4124564390896922,
  m01: 0.21267285140562253,
  m02: 0.0193338955823293,
  m10: 0.357576077643909,
  m11: 0.715152155287818,
  m12: 0.11919202588130297,
  m20: 0.18043748326639894,
  m21: 0.07217499330655958,
  m22: 0.9503040785363679
};

// XYZ → sRGB (chroma MtxXYZ2RGB).
const MtxXYZ2RGB = {
  m00: 3.2404541621141045,
  m01: -0.9692660305051868,
  m02: 0.055643430959114726,
  m10: -1.5371385127977166,
  m11: 1.8760108454466942,
  m12: -0.2040259135167538,
  m20: -0.498531409556016,
  m21: 0.041556017530349834,
  m22: 1.0572251882231791
};

// Bradford chromatic-adaptation matrices (chroma MtxAdaptMa / MtxAdaptMaI).
const MtxAdaptMa = {
  m00: 0.8951,
  m01: -0.7502,
  m02: 0.0389,
  m10: 0.2664,
  m11: 1.7135,
  m12: -0.0685,
  m20: -0.1614,
  m21: 0.0367,
  m22: 1.0296
};
const MtxAdaptMaI = {
  m00: 0.9869929054667123,
  m01: 0.43230526972339456,
  m02: -0.008528664575177328,
  m10: -0.14705425642099013,
  m11: 0.5183602715367776,
  m12: 0.04004282165408487,
  m20: 0.15996265166373125,
  m21: 0.0492912282128556,
  m22: 0.9684866957875502
};

// chroma RefWhiteRGB (sRGB reference white) — equals D65 here.
const RefWhiteRGB = { X: 0.95047, Y: 1, Z: 1.08883 };

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const RGB_RE =
  /^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*(?:,\s*([0-9.]+)\s*)?\)$/i;

// CSS named colors that callers pass through ColorUtils (chroma accepted the
// full CSS keyword set; this covers the names actually used in the app/tests).
const NAMED_COLORS: Record<string, string> = {
  transparent: "#00000000",
  black: "#000000",
  white: "#ffffff",
  red: "#ff0000",
  green: "#008000",
  blue: "#0000ff",
  yellow: "#ffff00",
  cyan: "#00ffff",
  magenta: "#ff00ff",
  gray: "#808080",
  grey: "#808080",
  silver: "#c0c0c0",
  maroon: "#800000",
  olive: "#808000",
  lime: "#00ff00",
  aqua: "#00ffff",
  teal: "#008080",
  navy: "#000080",
  fuchsia: "#ff00ff",
  purple: "#800080",
  orange: "#ffa500"
};

/**
 * Parse a hex (#rgb / #rgba / #rrggbb / #rrggbbaa) or rgb()/rgba() string, or a
 * supported CSS color name, into the internal Color. Throws on anything it
 * can't parse so callers fall back the same way they did with chroma's
 * throwing behavior.
 */
export function parse(input: string): Color {
  const str = input.trim();

  const rgbMatch = RGB_RE.exec(str);
  if (rgbMatch) {
    return {
      r: clamp(parseFloat(rgbMatch[1]), 0, 255),
      g: clamp(parseFloat(rgbMatch[2]), 0, 255),
      b: clamp(parseFloat(rgbMatch[3]), 0, 255),
      a: rgbMatch[4] !== undefined ? clamp(parseFloat(rgbMatch[4]), 0, 1) : 1
    };
  }

  const named = NAMED_COLORS[str.toLowerCase()];
  let hex = (named ?? str).replace(/^#/, "");
  if (hex.length === 3 || hex.length === 4) {
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (
    (hex.length === 6 || hex.length === 8) &&
    /^[0-9a-fA-F]+$/.test(hex)
  ) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }

  throw new Error(`colorMath: cannot parse color "${input}"`);
}

/** Coerce a string or Color into a Color. */
function toColor(color: string | Color): Color {
  return typeof color === "string" ? parse(color) : color;
}

// ---------------------------------------------------------------------------
// Lab / Lch conversions (mirrors chroma rgb2lab / lab2rgb / lab2lch / lch2lab)
// ---------------------------------------------------------------------------

function gammaAdjustSRGB(companded: number): number {
  const sign = Math.sign(companded);
  const c = Math.abs(companded);
  const linear =
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return linear * sign;
}

function compand(linear: number): number {
  const sign = Math.sign(linear);
  const c = Math.abs(linear);
  return (
    (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1.0 / 2.4) - 0.055) * sign
  );
}

function rgb2xyz(r0: number, g0: number, b0: number): [number, number, number] {
  const r = gammaAdjustSRGB(r0 / 255);
  const g = gammaAdjustSRGB(g0 / 255);
  const b = gammaAdjustSRGB(b0 / 255);

  let x = r * MtxRGB2XYZ.m00 + g * MtxRGB2XYZ.m10 + b * MtxRGB2XYZ.m20;
  let y = r * MtxRGB2XYZ.m01 + g * MtxRGB2XYZ.m11 + b * MtxRGB2XYZ.m21;
  let z = r * MtxRGB2XYZ.m02 + g * MtxRGB2XYZ.m12 + b * MtxRGB2XYZ.m22;

  const As = Xn * MtxAdaptMa.m00 + Yn * MtxAdaptMa.m10 + Zn * MtxAdaptMa.m20;
  const Bs = Xn * MtxAdaptMa.m01 + Yn * MtxAdaptMa.m11 + Zn * MtxAdaptMa.m21;
  const Cs = Xn * MtxAdaptMa.m02 + Yn * MtxAdaptMa.m12 + Zn * MtxAdaptMa.m22;

  const Ad =
    RefWhiteRGB.X * MtxAdaptMa.m00 +
    RefWhiteRGB.Y * MtxAdaptMa.m10 +
    RefWhiteRGB.Z * MtxAdaptMa.m20;
  const Bd =
    RefWhiteRGB.X * MtxAdaptMa.m01 +
    RefWhiteRGB.Y * MtxAdaptMa.m11 +
    RefWhiteRGB.Z * MtxAdaptMa.m21;
  const Cd =
    RefWhiteRGB.X * MtxAdaptMa.m02 +
    RefWhiteRGB.Y * MtxAdaptMa.m12 +
    RefWhiteRGB.Z * MtxAdaptMa.m22;

  const X1 =
    (x * MtxAdaptMa.m00 + y * MtxAdaptMa.m10 + z * MtxAdaptMa.m20) * (Ad / As);
  const Y1 =
    (x * MtxAdaptMa.m01 + y * MtxAdaptMa.m11 + z * MtxAdaptMa.m21) * (Bd / Bs);
  const Z1 =
    (x * MtxAdaptMa.m02 + y * MtxAdaptMa.m12 + z * MtxAdaptMa.m22) * (Cd / Cs);

  x = X1 * MtxAdaptMaI.m00 + Y1 * MtxAdaptMaI.m10 + Z1 * MtxAdaptMaI.m20;
  y = X1 * MtxAdaptMaI.m01 + Y1 * MtxAdaptMaI.m11 + Z1 * MtxAdaptMaI.m21;
  z = X1 * MtxAdaptMaI.m02 + Y1 * MtxAdaptMaI.m12 + Z1 * MtxAdaptMaI.m22;

  return [x, y, z];
}

function xyz2lab(x: number, y: number, z: number): [number, number, number] {
  const xr = x / Xn;
  const yr = y / Yn;
  const zr = z / Zn;

  const fx = xr > kE ? Math.pow(xr, 1.0 / 3.0) : (kK * xr + 16.0) / 116.0;
  const fy = yr > kE ? Math.pow(yr, 1.0 / 3.0) : (kK * yr + 16.0) / 116.0;
  const fz = zr > kE ? Math.pow(zr, 1.0 / 3.0) : (kK * zr + 16.0) / 116.0;

  return [116.0 * fy - 16.0, 500.0 * (fx - fy), 200.0 * (fy - fz)];
}

function rgb2lab(color: Color): [number, number, number] {
  const [x, y, z] = rgb2xyz(color.r, color.g, color.b);
  return xyz2lab(x, y, z);
}

function lab2xyz(L: number, a: number, b: number): [number, number, number] {
  const fy = (L + 16.0) / 116.0;
  const fx = 0.002 * a + fy;
  const fz = fy - 0.005 * b;

  const fx3 = fx * fx * fx;
  const fz3 = fz * fz * fz;

  const xr = fx3 > kE ? fx3 : (116.0 * fx - 16.0) / kK;
  const yr = L > kKE ? Math.pow((L + 16.0) / 116.0, 3.0) : L / kK;
  const zr = fz3 > kE ? fz3 : (116.0 * fz - 16.0) / kK;

  return [xr * Xn, yr * Yn, zr * Zn];
}

function xyz2rgb(
  x: number,
  y: number,
  z: number
): [number, number, number] {
  const As = Xn * MtxAdaptMa.m00 + Yn * MtxAdaptMa.m10 + Zn * MtxAdaptMa.m20;
  const Bs = Xn * MtxAdaptMa.m01 + Yn * MtxAdaptMa.m11 + Zn * MtxAdaptMa.m21;
  const Cs = Xn * MtxAdaptMa.m02 + Yn * MtxAdaptMa.m12 + Zn * MtxAdaptMa.m22;

  const Ad =
    RefWhiteRGB.X * MtxAdaptMa.m00 +
    RefWhiteRGB.Y * MtxAdaptMa.m10 +
    RefWhiteRGB.Z * MtxAdaptMa.m20;
  const Bd =
    RefWhiteRGB.X * MtxAdaptMa.m01 +
    RefWhiteRGB.Y * MtxAdaptMa.m11 +
    RefWhiteRGB.Z * MtxAdaptMa.m21;
  const Cd =
    RefWhiteRGB.X * MtxAdaptMa.m02 +
    RefWhiteRGB.Y * MtxAdaptMa.m12 +
    RefWhiteRGB.Z * MtxAdaptMa.m22;

  const X1 =
    (x * MtxAdaptMa.m00 + y * MtxAdaptMa.m10 + z * MtxAdaptMa.m20) * (Ad / As);
  const Y1 =
    (x * MtxAdaptMa.m01 + y * MtxAdaptMa.m11 + z * MtxAdaptMa.m21) * (Bd / Bs);
  const Z1 =
    (x * MtxAdaptMa.m02 + y * MtxAdaptMa.m12 + z * MtxAdaptMa.m22) * (Cd / Cs);

  const X2 = X1 * MtxAdaptMaI.m00 + Y1 * MtxAdaptMaI.m10 + Z1 * MtxAdaptMaI.m20;
  const Y2 = X1 * MtxAdaptMaI.m01 + Y1 * MtxAdaptMaI.m11 + Z1 * MtxAdaptMaI.m21;
  const Z2 = X1 * MtxAdaptMaI.m02 + Y1 * MtxAdaptMaI.m12 + Z1 * MtxAdaptMaI.m22;

  const r = compand(
    X2 * MtxXYZ2RGB.m00 + Y2 * MtxXYZ2RGB.m10 + Z2 * MtxXYZ2RGB.m20
  );
  const g = compand(
    X2 * MtxXYZ2RGB.m01 + Y2 * MtxXYZ2RGB.m11 + Z2 * MtxXYZ2RGB.m21
  );
  const b = compand(
    X2 * MtxXYZ2RGB.m02 + Y2 * MtxXYZ2RGB.m12 + Z2 * MtxXYZ2RGB.m22
  );

  return [r * 255, g * 255, b * 255];
}

function lab2color(
  L: number,
  a: number,
  b: number,
  alpha: number
): Color {
  const [x, y, z] = lab2xyz(L, a, b);
  const [r, g, bl] = xyz2rgb(x, y, z);
  // chroma clips rgb channels to 0..255 (clip_rgb); hex output rounds later.
  return {
    r: clamp(r, 0, 255),
    g: clamp(g, 0, 255),
    b: clamp(bl, 0, 255),
    a: alpha
  };
}

function lab2lch(
  L: number,
  a: number,
  b: number
): [number, number, number] {
  const c = Math.sqrt(a * a + b * b);
  let h = (Math.atan2(b, a) * RAD2DEG + 360) % 360;
  if (Math.round(c * 10000) === 0) {
    h = Number.NaN;
  }
  return [L, c, h];
}

function lch2lab(
  L: number,
  c: number,
  h: number
): [number, number, number] {
  const hue = (isNaN(h) ? 0 : h) * DEG2RAD;
  return [L, Math.cos(hue) * c, Math.sin(hue) * c];
}

// ---------------------------------------------------------------------------
// HSL (mirrors chroma rgb2hsl / hsl2rgb)
// ---------------------------------------------------------------------------

function rgb2hsl(color: Color): [number, number, number] {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;

  const minRgb = Math.min(r, g, b);
  const maxRgb = Math.max(r, g, b);

  const l = (maxRgb + minRgb) / 2;
  let s = 0;
  let h = Number.NaN;

  if (maxRgb !== minRgb) {
    s =
      l < 0.5
        ? (maxRgb - minRgb) / (maxRgb + minRgb)
        : (maxRgb - minRgb) / (2 - maxRgb - minRgb);

    if (r === maxRgb) {
      h = (g - b) / (maxRgb - minRgb);
    } else if (g === maxRgb) {
      h = 2 + (b - r) / (maxRgb - minRgb);
    } else {
      h = 4 + (r - g) / (maxRgb - minRgb);
    }
    h *= 60;
    if (h < 0) {
      h += 360;
    }
  }

  return [h, s, l];
}

function hsl2color(
  h: number,
  s: number,
  l: number,
  alpha: number
): Color {
  let r: number;
  let g: number;
  let b: number;

  if (s === 0) {
    r = g = b = l * 255;
  } else {
    const t3 = [0, 0, 0];
    const c = [0, 0, 0];
    const hNorm = (isNaN(h) ? 0 : h) / 360;
    const t2 = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const t1 = 2 * l - t2;
    t3[0] = hNorm + 1 / 3;
    t3[1] = hNorm;
    t3[2] = hNorm - 1 / 3;
    for (let i = 0; i < 3; i++) {
      if (t3[i] < 0) {
        t3[i] += 1;
      }
      if (t3[i] > 1) {
        t3[i] -= 1;
      }
      if (6 * t3[i] < 1) {
        c[i] = t1 + (t2 - t1) * 6 * t3[i];
      } else if (2 * t3[i] < 1) {
        c[i] = t2;
      } else if (3 * t3[i] < 2) {
        c[i] = t1 + (t2 - t1) * (2 / 3 - t3[i]) * 6;
      } else {
        c[i] = t1;
      }
    }
    [r, g, b] = [
      Math.round(c[0] * 255),
      Math.round(c[1] * 255),
      Math.round(c[2] * 255)
    ];
  }

  return { r, g, b, a: alpha };
}

// ---------------------------------------------------------------------------
// Public operations
// ---------------------------------------------------------------------------

/** Set the alpha channel (0..1). */
export function alpha(color: string | Color, a: number): Color {
  return { ...toColor(color), a };
}

/** Darken in Lab space — chroma `.darken(n)`. */
export function darken(color: string | Color, n = 1): Color {
  const c = toColor(color);
  const lab = rgb2lab(c);
  lab[0] -= Kn * n;
  return lab2color(lab[0], lab[1], lab[2], c.a);
}

/** Brighten in Lab space — chroma `.brighten(n)` === darken(-n). */
export function brighten(color: string | Color, n = 1): Color {
  return darken(color, -n);
}

/** Increase chroma in Lch space — chroma `.saturate(n)`. */
export function saturate(color: string | Color, n = 1): Color {
  const c = toColor(color);
  const lab = rgb2lab(c);
  const lch = lab2lch(lab[0], lab[1], lab[2]);
  lch[1] += Kn * n;
  if (lch[1] < 0) {
    lch[1] = 0;
  }
  const back = lch2lab(lch[0], lch[1], lch[2]);
  return lab2color(back[0], back[1], back[2], c.a);
}

/** Decrease chroma in Lch space — chroma `.desaturate(n)` === saturate(-n). */
export function desaturate(color: string | Color, n = 1): Color {
  return saturate(color, -n);
}

/** Linear per-channel RGB interpolation — chroma `mix(a, b, t, "rgb")`. */
export function mix(
  a: string | Color,
  b: string | Color,
  t = 0.5
): Color {
  const ca = toColor(a);
  const cb = toColor(b);
  return {
    r: ca.r + t * (cb.r - ca.r),
    g: ca.g + t * (cb.g - ca.g),
    b: ca.b + t * (cb.b - ca.b),
    a: ca.a + t * (cb.a - ca.a)
  };
}

/**
 * Multiply HSL saturation by a factor — chroma `.set("hsl.s", "*factor")`.
 * Like chroma, the scaled saturation is NOT clamped to 1 before the HSL→RGB
 * conversion; an over-saturated value flows through hsl2rgb and the resulting
 * RGB channels are clipped to 0..255 on output (chroma's clip_rgb). Negative
 * saturation is guarded to 0 (only reachable with a negative factor).
 */
export function setHslSaturationMultiplier(
  color: string | Color,
  factor: number
): Color {
  const c = toColor(color);
  const [h, s, l] = rgb2hsl(c);
  const newS = Math.max(0, s * factor);
  return hsl2color(h, newS, l, c.a);
}

/** WCAG relative luminance (sRGB linearization). */
export function luminance(color: string | Color): number {
  const c = toColor(color);
  const lin = (channel: number): number => {
    const v = channel / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function channelToHex(n: number): string {
  const hex = clamp(Math.round(n), 0, 255).toString(16);
  return hex.length === 1 ? "0" + hex : hex;
}

/**
 * Hex string. Mirrors chroma `.hex()` "auto" mode: appends a 2-digit alpha
 * only when alpha < 1. Pass `mode` to force inclusion/exclusion.
 */
export function toHex(
  color: string | Color,
  mode: "auto" | "rgb" | "rgba" = "auto"
): string {
  const c = toColor(color);
  const base = `#${channelToHex(c.r)}${channelToHex(c.g)}${channelToHex(c.b)}`;
  const includeAlpha = mode === "rgba" || (mode === "auto" && c.a < 1);
  if (includeAlpha) {
    return base + channelToHex(Math.round(c.a * 255));
  }
  return base;
}

/**
 * The [r, g, b, a] tuple chroma's `.rgba()` returns: r/g/b rounded to integers,
 * a left as a 0..1 float.
 */
export function rgba(color: string | Color): [number, number, number, number] {
  const c = toColor(color);
  return [
    clamp(Math.round(c.r), 0, 255),
    clamp(Math.round(c.g), 0, 255),
    clamp(Math.round(c.b), 0, 255),
    c.a
  ];
}
