import type { ColorSystemOptions, PaletteOptions } from "@mui/material/styles";
import { paletteDark } from "./paletteDark";
import { paletteLight } from "./paletteLight";

/**
 * Soft contrast variants of the dark and light palettes (Settings >
 * Appearance > Contrast). Only surface and text tokens change; accents,
 * status colors and scrims are the shipped values.
 *
 * Dark: the canvas sits at #1C1E22 instead of near-black, panels and cards
 * are a step lighter than the canvas so their edges stay visible, and body
 * text is off-white rather than pure white.
 * Light: surfaces drop from white to a light grey and text eases off black.
 */
export const paletteDarkSoft: PaletteOptions = {
  ...paletteDark,
  grey: {
    ...paletteDark.grey,
    700: "#33363D",
    800: "#2A2D33",
    900: "#1C1E22"
  },
  c_black: "#141518",
  c_bg_comment: "#22252A",
  c_background: "#3E414A",
  c_node_menu: "#24272D",
  c_scroll_hover: "#4A4E57",
  c_scroll_thumb: "#3A3D44",
  c_node_bg: "#272A30",
  c_node_bg_group: "#30333A",
  c_node_header_bg: "#272A30",
  c_node_header_bg_group: "#383B42",
  c_editor_bg_color: "#1C1E22",
  c_editor_grid_color: "#2C2F35",
  c_editor_axis_color: "#26292E",
  c_overlay_subtle: "rgba(255, 255, 255, 0.04)",
  c_overlay: "rgba(255, 255, 255, 0.07)",
  c_overlay_strong: "rgba(255, 255, 255, 0.16)",
  c_shadow_alpha: "0.7",
  c_app_header: "#1A1C20",
  c_tabs_header: "#202227",
  c_gray0: "#1C1E22",
  c_gray1: "#24272D",
  c_gray2: "#2E3138",
  c_gray3: "#3E414A",
  c_gray4: "#60646E",
  c_gray5: "#868B96",
  c_gray6: "#A3A8B0",
  background: {
    default: "#1C1E22",
    paper: "#24272D"
  },
  text: {
    primary: "#DCDFE4",
    secondary: "#A3A8B0",
    disabled: "rgba(220, 223, 228, 0.4)"
  },
  action: {
    ...paletteDark.action,
    active: "#DCDFE4",
    hover: "rgba(255, 255, 255, 0.04)",
    hoverOpacity: 0.04,
    selected: "rgba(255, 255, 255, 0.07)",
    selectedOpacity: 0.07
  },
  Paper: {
    default: "#24272D",
    paper: "#24272D",
    overlay: "#2C2F36"
  },
  divider: "rgba(255, 255, 255, 0.11)"
};

export const paletteLightSoft: NonNullable<ColorSystemOptions["palette"]> = {
  ...paletteLight,
  grey: {
    ...paletteLight.grey,
    700: "#D9DADF",
    800: "#E2E3E7",
    900: "#E9EAED"
  },
  c_bg_comment: "#F1F2F4",
  c_brightest: "#F7F7F8",
  c_background: "#E9EAED",
  c_node_menu: "#F1F2F4",
  c_scroll_thumb: "#C9CAD0",
  c_node_bg: "#F4F5F7",
  c_node_bg_group: "#EEEFF2",
  c_node_header_bg: "#F4F5F7",
  c_node_header_bg_group: "#E9EAED",
  c_editor_bg_color: "#E4E5E9",
  c_editor_grid_color: "#CBCCD3",
  c_editor_axis_color: "#D6D7DD",
  c_app_header: "#EEEFF2",
  c_tabs_header: "#E6E7EB",
  c_gray0: "#F1F2F4",
  c_gray1: "#E9EAED",
  c_gray2: "#DCDDE1",
  c_gray3: "#C6C7CE",
  text: {
    primary: "#26262C",
    secondary: "#55555F",
    disabled: "#9C9CA6"
  },
  background: {
    default: "#E9EAED",
    paper: "#F1F2F4"
  },
  Paper: {
    default: "#F1F2F4",
    paper: "#EDEEF1",
    overlay: "#E6E7EB"
  },
  divider: "#D6D7DD",
  AppBar: { defaultBg: "#EEEFF2" },
  glass: {
    blur: "blur(20px) saturate(180%)",
    backgroundDialog: "rgba(241, 242, 244, 0.72)",
    backgroundDialogContent: "rgba(241, 242, 244, 0.9)"
  }
};
