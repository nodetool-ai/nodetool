import { PaletteOptions } from "@mui/material/styles";

/**
 * Forest Theme - Natural green and earthy tones inspired by forest landscapes
 */
export const paletteForest: PaletteOptions = {
  error: {
    main: "#DC2626",
    light: "#EF4444",
    dark: "#B91C1C",
    contrastText: "#fff"
  },
  warning: {
    main: "#EA580C",
    light: "#F97316",
    dark: "#C2410C",
    contrastText: "#fff"
  },
  info: {
    main: "#0891B2",
    light: "#06B6D4",
    dark: "#0E7490",
    contrastText: "#fff"
  },
  success: {
    main: "#16A34A",
    light: "#22C55E",
    dark: "#15803D",
    contrastText: "#fff"
  },
  grey: ((): any => ({
    0: "#fff",
    50: "#F7FEF9",
    100: "#D1D5DB",
    200: "#9CA3AF",
    300: "#6B7280",
    400: "#4B5563",
    500: "#374151",
    600: "#1F2937",
    700: "#111827",
    800: "#030712",
    900: "#000000",
    1000: "#000"
  }))(),
  c_black: "#030712",
  c_bg_comment: "#111827",
  c_brightest: "#F7FEF9",
  c_white: "#F7FEF9",
  c_background: "#2D4A2D",
  c_node_menu: "#1F2937",
  c_selection: "#22C55E44",
  c_input: "#1E4620",
  c_output: "#3B3B1E",
  c_attention: "#84CC16",
  c_delete: "#DC2626",
  c_debug: "#EA580C",
  c_job: "#16A34A",
  c_node: "#059669",
  c_folder: "#CA8A04",
  c_progress: "#65A30D",
  c_link: "#4ADE80",
  c_link_visited: "#A3E635",
  c_scroll_bg: "transparent",
  c_scroll_hover: "#374151",
  c_scroll_thumb: "#4B5563",
  c_node_bg: "#111827",
  c_node_bg_group: "#1F2937",
  c_node_header_bg: "#030712",
  c_node_header_bg_group: "#374151",
  c_bg_loop: "#22C55E22",
  c_bg_group: "#16A34A30",
  c_editor_bg_color: "#111827",
  c_editor_grid_color: "#1F2937",
  c_editor_axis_color: "#374151",
  c_selection_rect: "#22C55E33",
  c_provider_api: "#4ADE80",
  c_provider_local: "#86EFAC",
  c_provider_hf: "#BEF264",
  c_app_header: "#030712",
  c_tabs_header: "#111827",

  primary: {
    main: "#22C55E",
    light: "#4ADE80",
    dark: "#16A34A",
    contrastText: "#000"
  },
  secondary: {
    main: "#84CC16",
    light: "#A3E635",
    dark: "#65A30D",
    contrastText: "#000"
  },
  background: {
    default: "#111827",
    paper: "rgba(17, 24, 39, 0.95)"
  },
  text: {
    primary: "#F7FEF9",
    secondary: "#9CA3AF",
    disabled: "rgba(247, 254, 249, 0.4)"
  },
  action: {
    active: "#F7FEF9",
    hover: "rgba(247, 254, 249, 0.05)",
    hoverOpacity: 0.05,
    selected: "rgba(34, 197, 94, 0.12)",
    selectedOpacity: 0.12,
    disabled: "rgba(247, 254, 249, 0.3)",
    disabledOpacity: 0.38,
    disabledBackground: "rgba(247, 254, 249, 0.1)",
    focus: "rgba(34, 197, 94, 0.18)",
    focusOpacity: 0.18,
    activatedOpacity: 0.24
  },
  divider: "rgba(156, 163, 175, 0.12)",
  Paper: {
    default: "#111827",
    paper: "#1F2937",
    overlay: "rgba(17, 24, 39, 0.85)"
  },
  glass: {
    blur: "blur(16px)",
    backgroundDialog: "rgba(17, 24, 39, 0.75)",
    backgroundDialogContent: "rgba(31, 41, 55, 0.5)"
  },
  rounded: {
    dialog: "20px",
    node: "8px",
    buttonSmall: "4px",
    buttonLarge: "6px"
  }
};
