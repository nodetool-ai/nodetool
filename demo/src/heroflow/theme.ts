/**
 * Visual tokens for the hero flow. The surface colors are the product's dark
 * palette (web/src/components/themes/paletteDark.ts) and the media colors are
 * the SpectraNode type colors (web/src/config/data_types.ts), so the look-alike
 * components read as the real UI at hero scale.
 */
import { staticFile } from "remotion";

export {
  PROMO_ACCENT_GRADIENT as ACCENT_GRADIENT,
  PROMO_FONT as FONT
} from "../promo/theme";

export const C = {
  stage: "#05060a",
  bg: "#08090A",
  paper: "#101113",
  overlay: "#17181B",
  raised: "#1B1D21",
  line: "rgba(255, 255, 255, 0.08)",
  lineStrong: "rgba(255, 255, 255, 0.15)",
  text: "#F7F8F8",
  dim: "#8A8F98",
  faint: "rgba(247, 248, 248, 0.38)",
  primary: "#5b86c4",
  fuchsia: "#E879F9",
  info: "#22D3EE",
  success: "#50FA7B",
  warning: "#FFB86C",
  image: "#E838FF",
  video: "#9460FF",
  textual: "#FFA808",
  audio: "#08B8FF"
} as const;

export const R = { sm: 6, md: 10, lg: 14, xl: 20, pill: 999 } as const;

export const MONO = "'JetBrains Mono', ui-monospace, 'SF Mono', monospace";

export const heroAsset = (file: string): string =>
  staticFile(`casts/heroflow/${file}`);
