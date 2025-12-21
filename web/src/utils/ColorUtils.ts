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
  if (isCssVar(hex)) {return hex;}

  return chroma(hex)
    .darken(amount / 100)
    .hex();
}

export function lightenHexColor(hex: string, amount: number): string {
  if (isCssVar(hex)) {return hex;}

  return chroma(hex)
    .brighten(amount / 100)
    .hex();
}

export function adjustSaturation(hex: string, amount: number): string {
  if (isCssVar(hex)) {return hex;}

  return chroma(hex)
    .set("hsl.s", `*${1 + amount / 100}`)
    .hex();
}

export function adjustHue(hex: string, amount: number): string {
  if (isCssVar(hex)) {return hex;}

  return chroma(hex).set("hsl.h", `+${amount}`).hex();
}

export function adjustLightness(hex: string, amount: number): string {
  if (isCssVar(hex)) {return hex;}

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
