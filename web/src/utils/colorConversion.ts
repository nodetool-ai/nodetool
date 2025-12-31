/**
 * Color conversion utilities for the professional color picker.
 * Supports HEX, RGB, HSL, HSB/HSV, CMYK, and LAB color models.
 */

export interface RGB {
  r: number; // 0-255
  g: number; // 0-255
  b: number; // 0-255
  a?: number; // 0-1
}

export interface HSL {
  h: number; // 0-360
  s: number; // 0-100
  l: number; // 0-100
  a?: number; // 0-1
}

export interface HSB {
  h: number; // 0-360
  s: number; // 0-100
  b: number; // 0-100
  a?: number; // 0-1
}

export interface CMYK {
  c: number; // 0-100
  m: number; // 0-100
  y: number; // 0-100
  k: number; // 0-100
}

export interface LAB {
  l: number; // 0-100
  a: number; // -128 to 127
  b: number; // -128 to 127
}

export interface ColorValue {
  hex: string;
  rgb: RGB;
  hsl: HSL;
  hsb: HSB;
  cmyk: CMYK;
  lab: LAB;
}

/**
 * Clamp a value between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Parse a hex color string to RGB
 * Supports #RGB, #RGBA, #RRGGBB, #RRGGBBAA formats
 */
export function hexToRgb(hex: string): RGB {
  // Remove the # if present
  let cleanHex = hex.replace(/^#/, "");

  // Handle shorthand notation (#RGB or #RGBA)
  if (cleanHex.length === 3) {
    cleanHex = cleanHex
      .split("")
      .map((c) => c + c)
      .join("");
  } else if (cleanHex.length === 4) {
    cleanHex = cleanHex
      .split("")
      .map((c) => c + c)
      .join("");
  }

  const hasAlpha = cleanHex.length === 8;
  const r = parseInt(cleanHex.slice(0, 2), 16);
  const g = parseInt(cleanHex.slice(2, 4), 16);
  const b = parseInt(cleanHex.slice(4, 6), 16);
  const a = hasAlpha ? parseInt(cleanHex.slice(6, 8), 16) / 255 : 1;

  return {
    r: isNaN(r) ? 0 : r,
    g: isNaN(g) ? 0 : g,
    b: isNaN(b) ? 0 : b,
    a: isNaN(a) ? 1 : a
  };
}

/**
 * Convert RGB to hex string
 */
export function rgbToHex(rgb: RGB, includeAlpha = false): string {
  const toHex = (n: number): string => {
    const hex = clamp(Math.round(n), 0, 255).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };

  let hex = `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;

  if (includeAlpha && rgb.a !== undefined && rgb.a < 1) {
    hex += toHex(Math.round(rgb.a * 255));
  }

  return hex;
}

/**
 * Convert RGB to HSL
 */
export function rgbToHsl(rgb: RGB): HSL {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / delta + (g < b ? 6 : 0)) * 60;
        break;
      case g:
        h = ((b - r) / delta + 2) * 60;
        break;
      case b:
        h = ((r - g) / delta + 4) * 60;
        break;
    }
  }

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
    a: rgb.a
  };
}

/**
 * Convert HSL to RGB
 */
export function hslToRgb(hsl: HSL): RGB {
  const h = hsl.h / 360;
  const s = hsl.s / 100;
  const l = hsl.l / 100;

  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hueToRgb = (p: number, q: number, t: number): number => {
      if (t < 0) {t += 1;}
      if (t > 1) {t -= 1;}
      if (t < 1 / 6) {return p + (q - p) * 6 * t;}
      if (t < 1 / 2) {return q;}
      if (t < 2 / 3) {return p + (q - p) * (2 / 3 - t) * 6;}
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    r = hueToRgb(p, q, h + 1 / 3);
    g = hueToRgb(p, q, h);
    b = hueToRgb(p, q, h - 1 / 3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
    a: hsl.a
  };
}

/**
 * Convert RGB to HSB/HSV
 */
export function rgbToHsb(rgb: RGB): HSB {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  const s = max === 0 ? 0 : delta / max;
  const v = max;

  if (delta !== 0) {
    switch (max) {
      case r:
        h = ((g - b) / delta + (g < b ? 6 : 0)) * 60;
        break;
      case g:
        h = ((b - r) / delta + 2) * 60;
        break;
      case b:
        h = ((r - g) / delta + 4) * 60;
        break;
    }
  }

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    b: Math.round(v * 100),
    a: rgb.a
  };
}

/**
 * Convert HSB/HSV to RGB
 */
export function hsbToRgb(hsb: HSB): RGB {
  const h = hsb.h / 360;
  const s = hsb.s / 100;
  const v = hsb.b / 100;

  let r: number, g: number, b: number;

  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);

  switch (i % 6) {
    case 0:
      r = v;
      g = t;
      b = p;
      break;
    case 1:
      r = q;
      g = v;
      b = p;
      break;
    case 2:
      r = p;
      g = v;
      b = t;
      break;
    case 3:
      r = p;
      g = q;
      b = v;
      break;
    case 4:
      r = t;
      g = p;
      b = v;
      break;
    case 5:
    default:
      r = v;
      g = p;
      b = q;
      break;
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
    a: hsb.a
  };
}

/**
 * Convert RGB to CMYK
 */
export function rgbToCmyk(rgb: RGB): CMYK {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const k = 1 - Math.max(r, g, b);

  if (k === 1) {
    return { c: 0, m: 0, y: 0, k: 100 };
  }

  const c = (1 - r - k) / (1 - k);
  const m = (1 - g - k) / (1 - k);
  const y = (1 - b - k) / (1 - k);

  return {
    c: Math.round(c * 100),
    m: Math.round(m * 100),
    y: Math.round(y * 100),
    k: Math.round(k * 100)
  };
}

/**
 * Convert CMYK to RGB
 */
export function cmykToRgb(cmyk: CMYK): RGB {
  const c = cmyk.c / 100;
  const m = cmyk.m / 100;
  const y = cmyk.y / 100;
  const k = cmyk.k / 100;

  const r = 255 * (1 - c) * (1 - k);
  const g = 255 * (1 - m) * (1 - k);
  const b = 255 * (1 - y) * (1 - k);

  return {
    r: Math.round(r),
    g: Math.round(g),
    b: Math.round(b)
  };
}

/**
 * Convert RGB to LAB (CIE L*a*b*)
 * Uses D65 illuminant as reference white
 */
export function rgbToLab(rgb: RGB): LAB {
  // First convert to XYZ
  let r = rgb.r / 255;
  let g = rgb.g / 255;
  let b = rgb.b / 255;

  // Apply gamma correction (sRGB to linear)
  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

  // Convert to XYZ using sRGB matrix
  let x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
  let y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  let z = r * 0.0193339 + g * 0.119192 + b * 0.9503041;

  // Reference white D65
  x = x / 0.95047;
  y = y / 1.0;
  z = z / 1.08883;

  // Convert XYZ to LAB
  const epsilon = 0.008856;
  const kappa = 903.3;

  const fx =
    x > epsilon ? Math.pow(x, 1 / 3) : (kappa * x + 16) / 116;
  const fy =
    y > epsilon ? Math.pow(y, 1 / 3) : (kappa * y + 16) / 116;
  const fz =
    z > epsilon ? Math.pow(z, 1 / 3) : (kappa * z + 16) / 116;

  return {
    l: Math.round(116 * fy - 16),
    a: Math.round(500 * (fx - fy)),
    b: Math.round(200 * (fy - fz))
  };
}

/**
 * Convert LAB to RGB
 */
export function labToRgb(lab: LAB): RGB {
  // Convert LAB to XYZ
  const fy = (lab.l + 16) / 116;
  const fx = lab.a / 500 + fy;
  const fz = fy - lab.b / 200;

  const epsilon = 0.008856;
  const kappa = 903.3;

  const xr =
    Math.pow(fx, 3) > epsilon ? Math.pow(fx, 3) : (116 * fx - 16) / kappa;
  const yr = lab.l > kappa * epsilon ? Math.pow(fy, 3) : lab.l / kappa;
  const zr =
    Math.pow(fz, 3) > epsilon ? Math.pow(fz, 3) : (116 * fz - 16) / kappa;

  // Reference white D65
  const x = xr * 0.95047;
  const y = yr * 1.0;
  const z = zr * 1.08883;

  // Convert XYZ to linear RGB
  let r = x * 3.2404542 + y * -1.5371385 + z * -0.4985314;
  let g = x * -0.969266 + y * 1.8760108 + z * 0.041556;
  let b = x * 0.0556434 + y * -0.2040259 + z * 1.0572252;

  // Apply gamma correction (linear to sRGB)
  r = r > 0.0031308 ? 1.055 * Math.pow(r, 1 / 2.4) - 0.055 : 12.92 * r;
  g = g > 0.0031308 ? 1.055 * Math.pow(g, 1 / 2.4) - 0.055 : 12.92 * g;
  b = b > 0.0031308 ? 1.055 * Math.pow(b, 1 / 2.4) - 0.055 : 12.92 * b;

  return {
    r: Math.round(clamp(r * 255, 0, 255)),
    g: Math.round(clamp(g * 255, 0, 255)),
    b: Math.round(clamp(b * 255, 0, 255))
  };
}

/**
 * Parse any color string and convert to RGB
 * Supports hex, rgb(), rgba(), hsl(), hsla(), and named colors
 */
export function parseColor(color: string): RGB | null {
  if (!color) {return null;}

  color = color.trim().toLowerCase();

  // Handle hex
  if (color.startsWith("#")) {
    return hexToRgb(color);
  }

  // Handle rgb()/rgba()
  const rgbMatch = color.match(
    /rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/
  );
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1], 10),
      g: parseInt(rgbMatch[2], 10),
      b: parseInt(rgbMatch[3], 10),
      a: rgbMatch[4] ? parseFloat(rgbMatch[4]) : 1
    };
  }

  // Handle hsl()/hsla()
  const hslMatch = color.match(
    /hsla?\s*\(\s*(\d+)\s*,\s*(\d+)%?\s*,\s*(\d+)%?(?:\s*,\s*([\d.]+))?\s*\)/
  );
  if (hslMatch) {
    return hslToRgb({
      h: parseInt(hslMatch[1], 10),
      s: parseInt(hslMatch[2], 10),
      l: parseInt(hslMatch[3], 10),
      a: hslMatch[4] ? parseFloat(hslMatch[4]) : 1
    });
  }

  // Handle named colors (common ones)
  const namedColors: Record<string, string> = {
    white: "#ffffff",
    black: "#000000",
    red: "#ff0000",
    green: "#00ff00",
    blue: "#0000ff",
    yellow: "#ffff00",
    cyan: "#00ffff",
    magenta: "#ff00ff",
    orange: "#ffa500",
    purple: "#800080",
    pink: "#ffc0cb",
    gray: "#808080",
    grey: "#808080",
    transparent: "#00000000"
  };

  if (namedColors[color]) {
    return hexToRgb(namedColors[color]);
  }

  return null;
}

/**
 * Convert a hex color to all color models
 */
export function hexToAllFormats(hex: string): ColorValue {
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb);
  const hsb = rgbToHsb(rgb);
  const cmyk = rgbToCmyk(rgb);
  const lab = rgbToLab(rgb);

  return {
    hex: rgbToHex(rgb, rgb.a !== undefined && rgb.a < 1),
    rgb,
    hsl,
    hsb,
    cmyk,
    lab
  };
}

/**
 * Get the relative luminance of a color (WCAG definition)
 */
export function getLuminance(rgb: RGB): number {
  const rsRGB = rgb.r / 255;
  const gsRGB = rgb.g / 255;
  const bsRGB = rgb.b / 255;

  const r =
    rsRGB <= 0.03928 ? rsRGB / 12.92 : Math.pow((rsRGB + 0.055) / 1.055, 2.4);
  const g =
    gsRGB <= 0.03928 ? gsRGB / 12.92 : Math.pow((gsRGB + 0.055) / 1.055, 2.4);
  const b =
    bsRGB <= 0.03928 ? bsRGB / 12.92 : Math.pow((bsRGB + 0.055) / 1.055, 2.4);

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Calculate contrast ratio between two colors (WCAG)
 */
export function getContrastRatio(color1: RGB, color2: RGB): number {
  const l1 = getLuminance(color1);
  const l2 = getLuminance(color2);

  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check WCAG compliance levels
 */
export function getWcagCompliance(
  foreground: RGB,
  background: RGB
): {
  ratio: number;
  aa: boolean;
  aaLarge: boolean;
  aaa: boolean;
  aaaLarge: boolean;
} {
  const ratio = getContrastRatio(foreground, background);

  return {
    ratio: Math.round(ratio * 100) / 100,
    aa: ratio >= 4.5,
    aaLarge: ratio >= 3,
    aaa: ratio >= 7,
    aaaLarge: ratio >= 4.5
  };
}

/**
 * Format RGB as CSS string
 */
export function rgbToCss(rgb: RGB): string {
  if (rgb.a !== undefined && rgb.a < 1) {
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${rgb.a})`;
  }
  return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

/**
 * Format HSL as CSS string
 */
export function hslToCss(hsl: HSL): string {
  if (hsl.a !== undefined && hsl.a < 1) {
    return `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, ${hsl.a})`;
  }
  return `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
}

/**
 * Simulate color blindness (protanopia, deuteranopia, tritanopia)
 */
export function simulateColorBlindness(
  rgb: RGB,
  type: "protanopia" | "deuteranopia" | "tritanopia"
): RGB {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  // Color blindness simulation matrices
  const matrices: Record<string, number[][]> = {
    protanopia: [
      [0.567, 0.433, 0],
      [0.558, 0.442, 0],
      [0, 0.242, 0.758]
    ],
    deuteranopia: [
      [0.625, 0.375, 0],
      [0.7, 0.3, 0],
      [0, 0.3, 0.7]
    ],
    tritanopia: [
      [0.95, 0.05, 0],
      [0, 0.433, 0.567],
      [0, 0.475, 0.525]
    ]
  };

  const matrix = matrices[type];
  const newR = matrix[0][0] * r + matrix[0][1] * g + matrix[0][2] * b;
  const newG = matrix[1][0] * r + matrix[1][1] * g + matrix[1][2] * b;
  const newB = matrix[2][0] * r + matrix[2][1] * g + matrix[2][2] * b;

  return {
    r: Math.round(clamp(newR * 255, 0, 255)),
    g: Math.round(clamp(newG * 255, 0, 255)),
    b: Math.round(clamp(newB * 255, 0, 255)),
    a: rgb.a
  };
}

/**
 * Determine if a color is light or dark
 */
export function isLightColor(rgb: RGB): boolean {
  return getLuminance(rgb) > 0.179;
}

/**
 * Get a contrasting text color (black or white) for a background
 */
export function getContrastingTextColor(background: RGB): RGB {
  return isLightColor(background)
    ? { r: 0, g: 0, b: 0 }
    : { r: 255, g: 255, b: 255 };
}
