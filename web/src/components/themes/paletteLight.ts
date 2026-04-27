import { PaletteOptions } from "@mui/material/styles";

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
    c_app_header?: string;
    c_tabs_header?: string;

    // Provider badge colors
    providerApi?: string;
    providerLocal?: string;
    providerHf?: string;

    background?: { default?: string; paper?: string };
    Paper?: {
      default?: string;
      paper?: string;
      overlay?: string;
    };
    glass?: {
      blur?: string;
      backgroundDialog?: string;
      backgroundDialogContent?: string;
    };
    rounded?: {
      dialog?: string;
      node?: string;
      buttonSmall?: string;
      buttonLarge?: string;
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
    c_provider_local?: string;
    c_provider_hf?: string;
    c_app_header?: string;
    c_tabs_header?: string;

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
    glass: {
      blur: string;
      backgroundDialog: string;
      backgroundDialogContent: string;
    };
    rounded: {
      dialog: string;
      node: string;
      buttonSmall: string;
      buttonLarge: string;
    };
  }
}

export const paletteLight: PaletteOptions = {
  error: {
    main: "#D8615B",
    light: "#F29D99",
    dark: "#A8443F",
    contrastText: "#1a1a1a"
  },
  warning: {
    main: "#D99A3B",
    light: "#F2C46E",
    dark: "#B07A2E",
    contrastText: "#000"
  },
  info: {
    main: "#3F7D8C",
    light: "#7FA8B3",
    dark: "#2E5F6A",
    contrastText: "#FAF7F2"
  },
  success: {
    main: "#6BAA75",
    light: "#9FD2A6",
    dark: "#4E8557",
    contrastText: "#FAF7F2"
  },
  grey: {
    0: "#000000",
    50: "#1E1C1A",
    100: "#2C2A27",
    200: "#4A4743",
    300: "#6A6660",
    400: "#8A857E",
    500: "#A59F97",
    600: "#C7C0B7",
    700: "#DED8D0",
    800: "#ECE6DE",
    900: "#F6F2EC",
    1000: "#FAF7F2"
  },
  c_black: "#1A1715",
  c_bg_comment: "#FAF8F5",
  c_brightest: "#FFFFFF",
  c_white: "#FFFFFF",
  c_background: "#FAF8F5",
  c_node_menu: "#F7F5F0",
  c_selection: "#5E9A8F33",
  c_input: "#F9F7F5",
  c_output: "#F2F5F2",
  c_attention: "#C96E51",
  c_delete: "#D8615B",
  c_debug: "#B35E7A",
  c_job: "#5E9A8F",
  c_node: "#5E9A8F",
  c_folder: "#D99A3B",
  c_progress: "#6BAA75",
  c_link: "#3F7D75",
  c_link_visited: "#6A8C88",
  c_scroll_bg: "transparent",
  c_scroll_hover: "#E0DCD6",
  c_scroll_thumb: "#D1CCC6",
  c_node_bg: "#FFFFFF",
  c_node_bg_group: "#FAF8F5",
  c_node_header_bg: "#FAF8F5",
  c_node_header_bg_group: "#FAF8F5",
  c_bg_loop: "#5E9A8F14",
  c_bg_group: "#A59F9720",
  c_editor_bg_color: "#FAF6EF",
  c_editor_grid_color: "#EDE6DA",
  c_editor_axis_color: "#E6E2DE",
  c_selection_rect: "rgba(94, 154, 143, 0.12)",
  c_provider_api: "#2C415A",
  c_provider_local: "#2E5B4E",
  c_provider_hf: "#6D4B6F",
  c_app_header: "#FFFFFF",
  c_tabs_header: "#F2EDE4",

  // Provider badge colors (light) - single token per provider type
  providerApi: "#2C415A",
  providerLocal: "#2E5B4E",
  providerHf: "#6D4B6F",

  primary: {
    main: "#2A8077",
    light: "#4FA59C",
    dark: "#1E5F58",
    contrastText: "#FAF7F2"
  },
  secondary: {
    main: "#C97C5D",
    light: "#E0A58C",
    dark: "#99573F",
    contrastText: "#FAF7F2"
  },
  background: {
    default: "#FAF6EF",
    paper: "#FFFFFF"
  },
  text: {
    primary: "#1A1715",
    secondary: "#5A5550",
    disabled: "#9A938A"
  },
  action: {
    active: "rgba(26, 23, 21, 0.72)",

    hover: "rgba(26, 23, 21, 0.05)",
    hoverOpacity: 0.05,

    selected: "rgba(26, 23, 21, 0.09)",
    selectedOpacity: 0.09,

    disabled: "rgba(26, 23, 21, 0.28)",
    disabledOpacity: 0.38,

    disabledBackground: "rgba(26, 23, 21, 0.12)",

    focus: "rgba(79, 125, 171, 0.32)",
    focusOpacity: 0.32,

    activatedOpacity: 0.14
  },
  Paper: {
    default: "#FFFFFF",
    paper: "#F4F0E9",
    overlay: "#F0EDE6"
  },
  divider: "#DCD3C5",
  glass: {
    blur: "blur(50px)",
    backgroundDialog: "rgba(255, 248, 240, 0.27)",
    backgroundDialogContent: "rgba(255, 250, 245, 0.6)"
  }
};
