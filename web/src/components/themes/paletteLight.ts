import {
  PaletteOptions,
  Color,
  PaletteColor
  // PaletteColorOptions,
  // PaletteColor,
  // SimplePaletteColorOptions
} from "@mui/material/styles";

declare module "@mui/material/styles" {
  interface PaletteOptions {
    c_bg_comment?: string;
    c_brightest?: string;
    c_black?: string;
    c_white?: string;
    c_background?: string;
    c_node_menu?: string;
    c_selection?: string;
    c_input?: string;
    c_output?: string;
    c_attention?: string;
    c_delete?: string;
    c_debug?: string;
    c_job?: string;
    c_node?: string;
    c_folder?: string;
    c_progress?: string;
    c_link?: string;
    c_link_visited?: string;
    c_scroll_bg?: string;
    c_scroll_hover?: string;
    c_scroll_thumb?: string;
    c_node_bg?: string;
    c_node_bg_group?: string;
    c_node_header_bg?: string;
    c_node_header_bg_group?: string;
    c_bg_loop?: string;
    c_bg_group?: string;
    c_editor_bg_color?: string;
    c_editor_grid_color?: string;
    c_editor_axis_color?: string;
    c_selection_rect?: string;
    c_provider_api?: string;
    c_provider_local?: string;
    c_provider_hf?: string;

    background?: { default?: string; paper?: string };
    Paper?: {
      default?: string;
      paper?: string;
      overlay?: string;
    };
  }

  interface Palette {
    c_black?: string;
    c_bg_comment?: string;
    c_brightest?: string;
    c_white?: string;
    c_background?: string;
    c_node_menu?: string;
    c_selection?: string;
    c_input?: string;
    c_output?: string;
    c_attention?: string;
    c_delete?: string;
    c_debug?: string;
    c_job?: string;
    c_node?: string;
    c_folder?: string;
    c_progress?: string;
    c_link?: string;
    c_link_visited?: string;
    c_scroll_bg?: string;
    c_scroll_hover?: string;
    c_scroll_thumb?: string;
    c_node_bg?: string;
    c_node_bg_group?: string;
    c_node_header_bg?: string;
    c_node_header_bg_group?: string;
    c_bg_loop?: string;
    c_bg_group?: string;
    c_editor_bg_color?: string;
    c_editor_grid_color?: string;
    c_editor_axis_color?: string;
    c_selection_rect?: string;
    c_provider_api?: string;
    // Provider badge colors
    providerApi?: string;
    providerLocal?: string;
    providerHf?: string;

    background: { default: string; paper: string };
    Paper: {
      default: string;
      paper: string;
      overlay: string;
    };
  }
}

export const paletteLight: PaletteOptions = {
  error: {
    main: "#EF4444",
    light: "#FF8A80",
    dark: "#C62828",
    contrastText: "#fff"
  },
  warning: {
    main: "#F59E0B",
    light: "#FFD591",
    dark: "#FF9800",
    contrastText: "#000"
  },
  info: {
    main: "#2563EB",
    light: "#60A5FA",
    dark: "#1E40AF",
    contrastText: "#fff"
  },
  success: {
    main: "#10B981",
    light: "#80E27E",
    dark: "#229A16",
    contrastText: "#fff"
  },
  grey: {
    0: "#000000",
    50: "#111827",
    100: "#1F2937",
    200: "#374151",
    300: "#4B5563",
    400: "#6B7280",
    500: "#9CA3AF",
    600: "#D1D5DB",
    700: "#E5E7EB",
    800: "#F1F1F1",
    900: "#F8F8F8",
    1000: "#FFFFFF"
  },
  c_black: "#0B1220",
  c_bg_comment: "#111827",
  c_brightest: "#FFFFFF",
  c_white: "#FFFFFF",
  c_background: "#EAF0F7",
  c_node_menu: "#E6EBF3",
  c_selection: "#5B9DFF33",
  c_input: "#E8F1FF",
  c_output: "#F3E8FF",
  c_attention: "#7C3AED",
  c_delete: "#EF4444",
  c_debug: "#F43F5E",
  c_job: "#2563EB",
  c_node: "#0EA5E9",
  c_folder: "#EAB308",
  c_progress: "#22C55E",
  c_link: "#2563EB",
  c_link_visited: "#7C3AED",
  c_scroll_bg: "transparent",
  c_scroll_hover: "#cfcfcf",
  c_scroll_thumb: "#b5b5b5",
  c_node_bg: "#FFFFFF",
  c_node_bg_group: "#F8FAFC",
  c_node_header_bg: "#F2F4F7",
  c_node_header_bg_group: "#E5E7EB",
  c_bg_loop: "#2563EB14",
  c_bg_group: "#A1A4AD30",
  c_editor_bg_color: "#F8FAFC",
  c_editor_grid_color: "#E5E7EB",
  c_editor_axis_color: "#D1D5DB",
  c_selection_rect: "rgba(37, 99, 235, 0.12)",
  c_provider_api: "#1E3A8A",
  c_provider_local: "#14532D",
  c_provider_hf: "#5B21B6",

  primary: {
    main: "#2563EB",
    light: "#60A5FA",
    dark: "#1E40AF",
    contrastText: "#fff"
  },
  secondary: {
    main: "#7C3AED",
    light: "#A78BFA",
    dark: "#5B21B6",
    contrastText: "#fff"
  },
  background: {
    default: "#F8FAFC",
    paper: "#FFFFFF"
  },
  text: {
    primary: "#0B1220",
    secondary: "#3B4351",
    disabled: "#9AA4B2"
  },
  action: {
    active: "#0B1220",
    hover: "#EEF2F7",
    selected: "#E2E8F0",
    disabled: "#94A3B8"
  },
  Paper: {
    default: "#FFFFFF",
    paper: "#FFFFFF",
    overlay: "#F2F4F7"
  },
  divider: "#E5E7EB"
};
