/**
 * Color harmony utilities for generating complementary colors.
 * Based on color theory principles.
 */

import { RGB, HSL, rgbToHsl, hslToRgb, rgbToHex, hexToRgb } from "./colorConversion";

export type HarmonyType =
  | "complementary"
  | "analogous"
  | "triadic"
  | "split-complementary"
  | "tetradic"
  | "square";

export interface ColorHarmony {
  type: HarmonyType;
  name: string;
  description: string;
  colors: string[]; // hex colors
}

/**
 * Rotate hue by a given number of degrees
 */
function rotateHue(hsl: HSL, degrees: number): HSL {
  let newHue = (hsl.h + degrees) % 360;
  if (newHue < 0) {
    newHue += 360;
  }
  return { ...hsl, h: newHue };
}

/**
 * Generate complementary color (opposite on color wheel)
 */
export function getComplementary(hex: string): string[] {
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb);
  
  const complement = rotateHue(hsl, 180);
  const complementRgb = hslToRgb(complement);
  
  return [hex, rgbToHex(complementRgb)];
}

/**
 * Generate analogous colors (adjacent on color wheel)
 * Returns colors at -30° and +30° from base
 */
export function getAnalogous(hex: string): string[] {
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb);
  
  const color1 = rotateHue(hsl, -30);
  const color2 = rotateHue(hsl, 30);
  
  return [
    rgbToHex(hslToRgb(color1)),
    hex,
    rgbToHex(hslToRgb(color2))
  ];
}

/**
 * Generate triadic colors (120° apart)
 */
export function getTriadic(hex: string): string[] {
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb);
  
  const color1 = rotateHue(hsl, 120);
  const color2 = rotateHue(hsl, 240);
  
  return [
    hex,
    rgbToHex(hslToRgb(color1)),
    rgbToHex(hslToRgb(color2))
  ];
}

/**
 * Generate split-complementary colors
 * Base color + two colors adjacent to the complement
 */
export function getSplitComplementary(hex: string): string[] {
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb);
  
  const color1 = rotateHue(hsl, 150);
  const color2 = rotateHue(hsl, 210);
  
  return [
    hex,
    rgbToHex(hslToRgb(color1)),
    rgbToHex(hslToRgb(color2))
  ];
}

/**
 * Generate tetradic/rectangular colors (60°, 180°, 240° from base)
 */
export function getTetradic(hex: string): string[] {
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb);
  
  const color1 = rotateHue(hsl, 60);
  const color2 = rotateHue(hsl, 180);
  const color3 = rotateHue(hsl, 240);
  
  return [
    hex,
    rgbToHex(hslToRgb(color1)),
    rgbToHex(hslToRgb(color2)),
    rgbToHex(hslToRgb(color3))
  ];
}

/**
 * Generate square colors (90° apart)
 */
export function getSquare(hex: string): string[] {
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb);
  
  const color1 = rotateHue(hsl, 90);
  const color2 = rotateHue(hsl, 180);
  const color3 = rotateHue(hsl, 270);
  
  return [
    hex,
    rgbToHex(hslToRgb(color1)),
    rgbToHex(hslToRgb(color2)),
    rgbToHex(hslToRgb(color3))
  ];
}

/**
 * Get all harmony types with their descriptions
 */
export function getHarmonyInfo(): Array<{ type: HarmonyType; name: string; description: string }> {
  return [
    {
      type: "complementary",
      name: "Complementary",
      description: "Opposite colors on the color wheel, creating high contrast"
    },
    {
      type: "analogous",
      name: "Analogous",
      description: "Adjacent colors that create a harmonious, natural look"
    },
    {
      type: "triadic",
      name: "Triadic",
      description: "Three colors equally spaced (120°) for vibrant combinations"
    },
    {
      type: "split-complementary",
      name: "Split Complementary",
      description: "Base color with two adjacent to its complement"
    },
    {
      type: "tetradic",
      name: "Tetradic",
      description: "Four colors forming a rectangle on the color wheel"
    },
    {
      type: "square",
      name: "Square",
      description: "Four colors evenly spaced (90°) for bold combinations"
    }
  ];
}

/**
 * Generate harmony colors for a given type
 */
export function generateHarmony(hex: string, type: HarmonyType): ColorHarmony {
  const info = getHarmonyInfo().find((h) => h.type === type)!;
  
  let colors: string[];
  switch (type) {
    case "complementary":
      colors = getComplementary(hex);
      break;
    case "analogous":
      colors = getAnalogous(hex);
      break;
    case "triadic":
      colors = getTriadic(hex);
      break;
    case "split-complementary":
      colors = getSplitComplementary(hex);
      break;
    case "tetradic":
      colors = getTetradic(hex);
      break;
    case "square":
      colors = getSquare(hex);
      break;
    default:
      colors = [hex];
  }
  
  return {
    type,
    name: info.name,
    description: info.description,
    colors
  };
}

/**
 * Generate all harmonies for a color
 */
export function generateAllHarmonies(hex: string): ColorHarmony[] {
  const types: HarmonyType[] = [
    "complementary",
    "analogous",
    "triadic",
    "split-complementary",
    "tetradic",
    "square"
  ];
  
  return types.map((type) => generateHarmony(hex, type));
}

/**
 * Generate a monochromatic palette (variations of the same hue)
 */
export function getMonochromatic(hex: string, count = 5): string[] {
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb);
  
  const colors: string[] = [];
  const step = 80 / (count - 1);
  
  for (let i = 0; i < count; i++) {
    const lightness = 10 + step * i;
    const newHsl = { ...hsl, l: Math.round(lightness) };
    colors.push(rgbToHex(hslToRgb(newHsl)));
  }
  
  return colors;
}

/**
 * Generate shades (darker variations)
 */
export function getShades(hex: string, count = 5): string[] {
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb);
  
  const colors: string[] = [];
  const step = hsl.l / (count);
  
  for (let i = count - 1; i >= 0; i--) {
    const lightness = step * i;
    const newHsl = { ...hsl, l: Math.round(lightness) };
    colors.push(rgbToHex(hslToRgb(newHsl)));
  }
  
  return colors;
}

/**
 * Generate tints (lighter variations)
 */
export function getTints(hex: string, count = 5): string[] {
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb);
  
  const colors: string[] = [];
  const remaining = 100 - hsl.l;
  const step = remaining / (count);
  
  for (let i = 0; i < count; i++) {
    const lightness = hsl.l + step * i;
    const newHsl = { ...hsl, l: Math.round(lightness) };
    colors.push(rgbToHex(hslToRgb(newHsl)));
  }
  
  return colors;
}
