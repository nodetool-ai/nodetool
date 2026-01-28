import { PaletteOptions } from "@mui/material/styles";

/**
 * Midnight Theme - Deep purple and blue tones inspired by night sky
 */
export const paletteMidnight: PaletteOptions = {
  error: {
    main: "#F87171",
    light: "#FCA5A5",
    dark: "#DC2626",
    contrastText: "#fff"
  },
  warning: {
    main: "#FBBF24",
    light: "#FCD34D",
    dark: "#F59E0B",
    contrastText: "#000"
  },
  info: {
    main: "#60A5FA",
    light: "#93C5FD",
    dark: "#3B82F6",
    contrastText: "#000"
  },
  success: {
    main: "#34D399",
    light: "#6EE7B7",
    dark: "#10B981",
    contrastText: "#000"
  },
  grey: ((): any => ({
    0: "#fff",
    50: "#F8FAFC",
    100: "#E2E8F0",
    200: "#CBD5E1",
    300: "#94A3B8",
    400: "#64748B",
    500: "#475569",
    600: "#334155",
    700: "#1E293B",
    800: "#0F172A",
    900: "#020617",
    1000: "#000"
  }))(),
  c_black: "#020617",
  c_bg_comment: "#0F172A",
  c_brightest: "#F8FAFC",
  c_white: "#F8FAFC",
  c_background: "#1E2550",
  c_node_menu: "#0F172A",
  c_selection: "#8B5CF644",
  c_input: "#1E2A5A",
  c_output: "#2A1E5A",
  c_attention: "#A78BFA",
  c_delete: "#F87171",
  c_debug: "#FBBF24",
  c_job: "#60A5FA",
  c_node: "#8B5CF6",
  c_folder: "#F59E0B",
  c_progress: "#34D399",
  c_link: "#93C5FD",
  c_link_visited: "#C4B5FD",
  c_scroll_bg: "transparent",
  c_scroll_hover: "#334155",
  c_scroll_thumb: "#475569",
  c_node_bg: "#0F172A",
  c_node_bg_group: "#1E293B",
  c_node_header_bg: "#020617",
  c_node_header_bg_group: "#334155",
  c_bg_loop: "#6366F122",
  c_bg_group: "#8B5CF630",
  c_editor_bg_color: "#0F172A",
  c_editor_grid_color: "#1E293B",
  c_editor_axis_color: "#334155",
  c_selection_rect: "#8B5CF633",
  c_provider_api: "#93C5FD",
  c_provider_local: "#6EE7B7",
  c_provider_hf: "#C4B5FD",
  c_app_header: "#020617",
  c_tabs_header: "#0F172A",

  primary: {
    main: "#8B5CF6",
    light: "#A78BFA",
    dark: "#7C3AED",
    contrastText: "#fff"
  },
  secondary: {
    main: "#6366F1",
    light: "#818CF8",
    dark: "#4F46E5",
    contrastText: "#fff"
  },
  background: {
    default: "#0F172A",
    paper: "rgba(15, 23, 42, 0.95)"
  },
  text: {
    primary: "#F8FAFC",
    secondary: "#CBD5E1",
    disabled: "rgba(248, 250, 252, 0.4)"
  },
  action: {
    active: "#F8FAFC",
    hover: "rgba(248, 250, 252, 0.05)",
    hoverOpacity: 0.05,
    selected: "rgba(139, 92, 246, 0.12)",
    selectedOpacity: 0.12,
    disabled: "rgba(248, 250, 252, 0.3)",
    disabledOpacity: 0.38,
    disabledBackground: "rgba(248, 250, 252, 0.1)",
    focus: "rgba(139, 92, 246, 0.18)",
    focusOpacity: 0.18,
    activatedOpacity: 0.24
  },
  divider: "rgba(203, 213, 225, 0.12)",
  Paper: {
    default: "#0F172A",
    paper: "#1E293B",
    overlay: "rgba(15, 23, 42, 0.85)"
  },
  glass: {
    blur: "blur(16px)",
    backgroundDialog: "rgba(15, 23, 42, 0.75)",
    backgroundDialogContent: "rgba(30, 41, 59, 0.5)"
  },
  rounded: {
    dialog: "20px",
    node: "8px",
    buttonSmall: "4px",
    buttonLarge: "6px"
  }
};
