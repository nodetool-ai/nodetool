/**
 * Sketch Editor – Geometry & Color Primitives
 *
 * Points, sizes, rectangles, and color conversion helpers used across the
 * sketch editor domain.
 */

// ─── Primitive Types ──────────────────────────────────────────────────────────

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ─── Color Conversion Helpers ─────────────────────────────────────────────────

/** RGBA with alpha in the 0–1 range (CSS-style). */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const clamp255 = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/**
 * Parse hex, rgb(), or rgba() strings used by the sketch color pickers.
 * Unknown input falls back to opaque white.
 */
export function parseColorToRgba(input: string): Rgba {
  const t = input.trim();
  if (!t) {
    return { r: 255, g: 255, b: 255, a: 1 };
  }
  const lower = t.toLowerCase();
  if (lower.startsWith("rgba")) {
    const m = lower.match(
      /rgba\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/
    );
    if (m) {
      return {
        r: clamp255(Number(m[1])),
        g: clamp255(Number(m[2])),
        b: clamp255(Number(m[3])),
        a: clamp01(Number(m[4]))
      };
    }
  }
  if (lower.startsWith("rgb(")) {
    const m = lower.match(/rgb\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/);
    if (m) {
      return {
        r: clamp255(Number(m[1])),
        g: clamp255(Number(m[2])),
        b: clamp255(Number(m[3])),
        a: 1
      };
    }
  }

  let h = t.replace(/^#/, "");
  if (!/^[0-9a-fA-F]+$/.test(h)) {
    return { r: 255, g: 255, b: 255, a: 1 };
  }
  if (h.length === 3) {
    h = `${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
  }
  if (h.length === 6) {
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    if ([r, g, b].some((x) => Number.isNaN(x))) {
      return { r: 255, g: 255, b: 255, a: 1 };
    }
    return { r, g, b, a: 1 };
  }
  if (h.length === 8) {
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const aByte = parseInt(h.slice(6, 8), 16);
    if ([r, g, b, aByte].some((x) => Number.isNaN(x))) {
      return { r: 255, g: 255, b: 255, a: 1 };
    }
    return { r, g, b, a: clamp01(aByte / 255) };
  }

  return { r: 255, g: 255, b: 255, a: 1 };
}

/** Serialize to rgb() / rgba() for canvas and CSS. */
export function rgbaToCss({ r, g, b, a }: Rgba): string {
  const rr = clamp255(r);
  const gg = clamp255(g);
  const bb = clamp255(b);
  const aa = clamp01(a);
  if (aa >= 1) {
    return `rgb(${rr}, ${gg}, ${bb})`;
  }
  return `rgba(${rr}, ${gg}, ${bb}, ${aa})`;
}

/** Parse a hex or rgb/rgba string to {r, g, b} (0-255). */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const { r, g, b } = parseColorToRgba(hex);
  return { r, g, b };
}

/** Convert {r, g, b} (0-255) to a hex color string */
export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${clamp(r).toString(16).padStart(2, "0")}${clamp(g).toString(16).padStart(2, "0")}${clamp(b).toString(16).padStart(2, "0")}`;
}

/** #rrggbb for HTML color inputs (alpha stripped). */
export function colorToHex6(input: string): string {
  const { r, g, b } = parseColorToRgba(input);
  return rgbToHex(r, g, b);
}

/**
 * Eyedropper supplies opaque #rrggbb; keep the current foreground alpha.
 */
export function mergeRgbHexIntoColor(rgbHex6: string, currentColor: string): string {
  const next = rgbHex6.startsWith("#") ? rgbHex6 : `#${rgbHex6}`;
  if (!/^#[0-9a-fA-F]{6}$/.test(next)) {
    return currentColor;
  }
  const { r, g, b } = parseColorToRgba(next);
  const { a } = parseColorToRgba(currentColor);
  return rgbaToCss({ r, g, b, a });
}

/** Convert {r, g, b} (0-255) to {h, s, l} (h: 0-360, s: 0-100, l: 0-100) */
export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) {
      h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
    } else if (max === gn) {
      h = ((bn - rn) / d + 2) / 6;
    } else {
      h = ((rn - gn) / d + 4) / 6;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

/** Convert {r, g, b} (0-255) to {h, s, v} (h: 0-360, s: 0-1, v: 0-1) */
export function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) {
      h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
    } else if (max === gn) {
      h = ((bn - rn) / d + 2) / 6;
    } else {
      h = ((rn - gn) / d + 4) / 6;
    }
  }
  return { h: Math.round(h * 360), s: max === 0 ? 0 : d / max, v: max };
}

/** Convert {h, s, v} (h: 0-360, s: 0-1, v: 0-1) to {r, g, b} (0-255) */
export function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const hn = (h % 360) / 60;
  const i = Math.floor(hn);
  const f = hn - i;
  const p = v * (1 - s);
  const q = v * (1 - s * f);
  const t = v * (1 - s * (1 - f));
  let r = 0, g = 0, b = 0;
  switch (i) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    default: r = v; g = p; b = q;
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

/** Convert {h, s, l} (h: 0-360, s: 0-100, l: 0-100) to {r, g, b} (0-255) */
export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hn = h / 360;
  const sn = s / 100;
  const ln = l / 100;

  if (sn === 0) {
    const val = Math.round(ln * 255);
    return { r: val, g: val, b: val };
  }

  const hue2rgb = (p: number, q: number, t: number): number => {
    let tn = t;
    if (tn < 0) { tn += 1; }
    if (tn > 1) { tn -= 1; }
    if (tn < 1 / 6) { return p + (q - p) * 6 * tn; }
    if (tn < 1 / 2) { return q; }
    if (tn < 2 / 3) { return p + (q - p) * (2 / 3 - tn) * 6; }
    return p;
  };

  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
  const p = 2 * ln - q;

  return {
    r: Math.round(hue2rgb(p, q, hn + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, hn) * 255),
    b: Math.round(hue2rgb(p, q, hn - 1 / 3) * 255)
  };
}
