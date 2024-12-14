import chroma from "chroma-js";

export function hexToRgba(hex: string, alpha: number): string {
  const rgba = chroma(hex).alpha(alpha).rgba();
  return `rgba(${rgba[0]}, ${rgba[1]}, ${rgba[2]}, ${rgba[3]})`;
}

export function darkenHexColor(hex: string, amount: number): string {
  return chroma(hex)
    .darken(amount / 100)
    .hex();
}

export function lightenHexColor(hex: string, amount: number): string {
  return chroma(hex)
    .brighten(amount / 100)
    .hex();
}

export function adjustSaturation(hex: string, amount: number): string {
  return chroma(hex)
    .set("hsl.s", `*${1 + amount / 100}`)
    .hex();
}

export function adjustHue(hex: string, amount: number): string {
  return chroma(hex).set("hsl.h", `+${amount}`).hex();
}

export function adjustLightness(hex: string, amount: number): string {
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
  const foregroundColor = chroma(hexColor);
  const bgColor = chroma(backgroundColor);

  const blendedColor = chroma.mix(bgColor, foregroundColor, alpha, "rgb");

  return blendedColor.hex();
}
