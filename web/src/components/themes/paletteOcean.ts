import { PaletteOptions } from "@mui/material/styles";

/**
 * Ocean Theme - Cool blue and teal colors inspired by the ocean depths
 */
export const paletteOcean: PaletteOptions = {
  error: {
    main: "#EF4444",
    light: "#F87171",
    dark: "#DC2626",
    contrastText: "#fff"
  },
  warning: {
    main: "#F59E0B",
    light: "#FBBf24",
    dark: "#D97706",
    contrastText: "#000"
  },
  info: {
    main: "#06B6D4",
    light: "#22D3EE",
    dark: "#0891B2",
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
    50: "#F1F5F9",
    100: "#CBD5E1",
    200: "#94A3B8",
    300: "#64748B",
    400: "#475569",
    500: "#334155",
    600: "#1E293B",
    700: "#0F172A",
    800: "#020617",
    900: "#000000",
    1000: "#000"
  }))(),
  c_black: "#020617",
  c_bg_comment: "#0F172A",
  c_brightest: "#F8FAFC",
  c_white: "#F8FAFC",
  c_background: "#1E3A5F",
  c_node_menu: "#1E293B",
  c_selection: "#0EA5E944",
  c_input: "#164E63",
  c_output: "#1E3A8A",
  c_attention: "#06B6D4",
  c_delete: "#EF4444",
  c_debug: "#F59E0B",
  c_job: "#3B82F6",
  c_node: "#0891B2",
  c_folder: "#14B8A6",
  c_progress: "#10B981",
  c_link: "#38BDF8",
  c_link_visited: "#818CF8",
  c_scroll_bg: "transparent",
  c_scroll_hover: "#334155",
  c_scroll_thumb: "#475569",
  c_node_bg: "#0F172A",
  c_node_bg_group: "#1E293B",
  c_node_header_bg: "#020617",
  c_node_header_bg_group: "#334155",
  c_bg_loop: "#3B82F622",
  c_bg_group: "#06B6D430",
  c_editor_bg_color: "#0F172A",
  c_editor_grid_color: "#1E293B",
  c_editor_axis_color: "#334155",
  c_selection_rect: "#0EA5E933",
  c_provider_api: "#38BDF8",
  c_provider_local: "#34D399",
  c_provider_hf: "#A78BFA",
  c_app_header: "#020617",
  c_tabs_header: "#0F172A",

  primary: {
    main: "#0EA5E9",
    light: "#38BDF8",
    dark: "#0284C7",
    contrastText: "#fff"
  },
  secondary: {
    main: "#06B6D4",
    light: "#22D3EE",
    dark: "#0891B2",
    contrastText: "#fff"
  },
  background: {
    default: "#0F172A",
    paper: "rgba(15, 23, 42, 0.95)"
  },
  text: {
    primary: "#F1F5F9",
    secondary: "#94A3B8",
    disabled: "rgba(241, 245, 249, 0.4)"
  },
  action: {
    active: "#F1F5F9",
    hover: "rgba(241, 245, 249, 0.05)",
    hoverOpacity: 0.05,
    selected: "rgba(14, 165, 233, 0.12)",
    selectedOpacity: 0.12,
    disabled: "rgba(241, 245, 249, 0.3)",
    disabledOpacity: 0.38,
    disabledBackground: "rgba(241, 245, 249, 0.1)",
    focus: "rgba(14, 165, 233, 0.18)",
    focusOpacity: 0.18,
    activatedOpacity: 0.24
  },
  divider: "rgba(148, 163, 184, 0.12)",
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
