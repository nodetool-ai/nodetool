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
    contrastText: "#FAF7F2"
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
  c_bg_comment: "#FAF7F2",
  c_brightest: "#FAF7F2",
  c_white: "#FAF7F2",
  c_background: "#FAF7F2",
  c_node_menu: "#F4EFE7",
  c_selection: "#5E9A8F33",
  c_input: "#F6EFE7",
  c_output: "#EFF5EF",
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
  c_scroll_hover: "#D9D2C9",
  c_scroll_thumb: "#C7BEB3",
  c_node_bg: "#f9f8f7",
  c_node_bg_group: "#FAF7F2",
  c_node_header_bg: "#FAF7F2",
  c_node_header_bg_group: "#FAF7F2",
  c_bg_loop: "#5E9A8F14",
  c_bg_group: "#A59F9730",
  c_editor_bg_color: "#ccc8c6",
  c_editor_grid_color: "#E6E6E6",
  c_editor_axis_color: "#E7E7E7",
  c_selection_rect: "rgba(94, 154, 143, 0.12)",
  c_provider_api: "#2C415A",
  c_provider_local: "#2E5B4E",
  c_provider_hf: "#6D4B6F",
  c_app_header: "#FAF7F2",
  c_tabs_header: "#FAF7F2",

  // Provider badge colors (light) - single token per provider type
  providerApi: "#2C415A",
  providerLocal: "#2E5B4E",
  providerHf: "#6D4B6F",

  primary: {
    main: "#4187deff",
    light: "#93C5FD",
    dark: "#1449dbff",
    contrastText: "#FAF7F2"
  },
  secondary: {
    main: "#C97C5D",
    light: "#E0A58C",
    dark: "#99573F",
    contrastText: "#FAF7F2"
  },
  background: {
    default: "#FAF7F2",
    paper: "#FAF7F2"
  },
  text: {
    primary: "#2A2A2A",
    secondary: "#5B5751",
    disabled: "#A59F97"
  },
  action: {
    // Icons, enabled interactive elements, "on" state indicators
    active: "rgba(0, 0, 0, 0.54)",

    // Background when hovering over clickable items
    hover: "rgba(0, 0, 0, 0.04)",
    hoverOpacity: 0.04,

    // Background for selected list items, active nav items
    selected: "rgba(0, 0, 0, 0.08)",
    selectedOpacity: 0.08,

    // Text color for disabled buttons, form fields, icons
    disabled: "rgba(0, 0, 0, 0.26)",
    disabledOpacity: 0.38,

    // Background color for disabled buttons, form controls
    disabledBackground: "rgba(0, 0, 0, 0.12)",

    // Focus ring color, keyboard navigation indicators
    focus: "rgba(0, 0, 0, 0.12)",
    focusOpacity: 0.12,

    // Higher emphasis than selected (used for activated states)
    activatedOpacity: 0.12
  },
  Paper: {
    default: "#FAF7F2",
    paper: "#FAF7F2",
    overlay: "#F0EBE4"
  },
  divider: "#E7DFD6",
  glass: {
    blur: "blur(50px)",
    backgroundDialog: "rgba(255, 248, 240, 0.27)",
    backgroundDialogContent: "rgba(255, 250, 245, 0.6)"
  }
};
