import { PaletteOptions } from "@mui/material/styles";

/**
 * Sunset Theme - Warm orange, pink and purple hues inspired by sunset skies
 */
export const paletteSunset: PaletteOptions = {
  error: {
    main: "#DC2626",
    light: "#EF4444",
    dark: "#B91C1C",
    contrastText: "#fff"
  },
  warning: {
    main: "#F97316",
    light: "#FB923C",
    dark: "#EA580C",
    contrastText: "#000"
  },
  info: {
    main: "#8B5CF6",
    light: "#A78BFA",
    dark: "#7C3AED",
    contrastText: "#fff"
  },
  success: {
    main: "#10B981",
    light: "#34D399",
    dark: "#059669",
    contrastText: "#fff"
  },
  grey: ((): any => ({
    0: "#fff",
    50: "#FEF5F1",
    100: "#E5E7EB",
    200: "#D1D5DB",
    300: "#9CA3AF",
    400: "#6B7280",
    500: "#4B5563",
    600: "#374151",
    700: "#1F2937",
    800: "#111827",
    900: "#000000",
    1000: "#000"
  }))(),
  c_black: "#111827",
  c_bg_comment: "#1F2937",
  c_brightest: "#FEF5F1",
  c_white: "#FEF5F1",
  c_background: "#5A3A4A",
  c_node_menu: "#1F2937",
  c_selection: "#F472B644",
  c_input: "#5A2A3A",
  c_output: "#4A2A5A",
  c_attention: "#F472B6",
  c_delete: "#DC2626",
  c_debug: "#F97316",
  c_job: "#8B5CF6",
  c_node: "#EC4899",
  c_folder: "#F59E0B",
  c_progress: "#A855F7",
  c_link: "#F472B6",
  c_link_visited: "#C084FC",
  c_scroll_bg: "transparent",
  c_scroll_hover: "#4B5563",
  c_scroll_thumb: "#6B7280",
  c_node_bg: "#1F2937",
  c_node_bg_group: "#374151",
  c_node_header_bg: "#111827",
  c_node_header_bg_group: "#4B5563",
  c_bg_loop: "#8B5CF622",
  c_bg_group: "#EC489930",
  c_editor_bg_color: "#1F2937",
  c_editor_grid_color: "#374151",
  c_editor_axis_color: "#4B5563",
  c_selection_rect: "#F472B633",
  c_provider_api: "#F472B6",
  c_provider_local: "#34D399",
  c_provider_hf: "#C084FC",
  c_app_header: "#111827",
  c_tabs_header: "#1F2937",

  primary: {
    main: "#EC4899",
    light: "#F472B6",
    dark: "#DB2777",
    contrastText: "#fff"
  },
  secondary: {
    main: "#F97316",
    light: "#FB923C",
    dark: "#EA580C",
    contrastText: "#000"
  },
  background: {
    default: "#1F2937",
    paper: "rgba(31, 41, 55, 0.95)"
  },
  text: {
    primary: "#FEF5F1",
    secondary: "#D1D5DB",
    disabled: "rgba(254, 245, 241, 0.4)"
  },
  action: {
    active: "#FEF5F1",
    hover: "rgba(254, 245, 241, 0.05)",
    hoverOpacity: 0.05,
    selected: "rgba(236, 72, 153, 0.12)",
    selectedOpacity: 0.12,
    disabled: "rgba(254, 245, 241, 0.3)",
    disabledOpacity: 0.38,
    disabledBackground: "rgba(254, 245, 241, 0.1)",
    focus: "rgba(236, 72, 153, 0.18)",
    focusOpacity: 0.18,
    activatedOpacity: 0.24
  },
  divider: "rgba(209, 213, 219, 0.12)",
  Paper: {
    default: "#1F2937",
    paper: "#374151",
    overlay: "rgba(31, 41, 55, 0.85)"
  },
  glass: {
    blur: "blur(16px)",
    backgroundDialog: "rgba(31, 41, 55, 0.75)",
    backgroundDialogContent: "rgba(55, 65, 81, 0.5)"
  },
  rounded: {
    dialog: "20px",
    node: "8px",
    buttonSmall: "4px",
    buttonLarge: "6px"
  }
};
