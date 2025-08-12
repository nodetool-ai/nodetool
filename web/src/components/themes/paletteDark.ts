import {
  PaletteOptions,
  Color
  // PaletteColor,
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

export const paletteDark: PaletteOptions = {
  error: {
    main: "#FF5555",
    contrastText: "#fff"
  },
  warning: {
    main: "#FFB86C",
    contrastText: "#000"
  },
  info: {
    main: "#60A5FA",
    contrastText: "#0B1220"
  },
  success: {
    main: "#50FA7B",
    contrastText: "#000"
  },
  grey: ((): any => ({
    0: "#fff", // white
    50: "#F5F5F5", // Standard MUI light grey
    100: "#D9D9D9", // from c_gray6
    200: "#BDBDBD", // from c_gray5
    300: "#A9A9A9", // spare
    400: "#959595", // from c_gray4
    500: "#6D6D6D", // from c_gray3
    600: "#444444", // from c_gray2
    700: "#333333", // spare
    800: "#242424", // from c_gray1
    900: "#0E0E0E", // from c_gray0
    1000: "#000" // black
  }))(),
  c_black: "#020202",
  c_bg_comment: "#fff",
  c_brightest: "#FCFCFC",
  c_white: "#FCFCFC",
  c_background: "#424854",
  c_node_menu: "#232323",
  c_selection: "#8EACA777",
  c_input: "#374f4f",
  c_output: "#493f4d",
  c_attention: "#E35BFF",
  c_delete: "#FF2222",
  c_debug: "#FF3355",
  c_job: "#223399",
  c_node: "#029486",
  c_folder: "#d6ae67",
  c_progress: "#556611",
  c_link: "#93C5FD",
  c_link_visited: "#A5B4FC",
  c_scroll_bg: "transparent",
  c_scroll_hover: "#585858",
  c_scroll_thumb: "#535353",
  c_node_bg: "#1C1F26",
  c_node_bg_group: "#232734",
  c_node_header_bg: "#171A20",
  c_node_header_bg_group: "#2B2F3A",
  c_bg_loop: "#2563EB22",
  c_bg_group: "#A1A4AD30",
  c_editor_bg_color: "#111",
  c_editor_grid_color: "#2A2E38",
  c_editor_axis_color: "#1F2330",
  c_selection_rect: "#cdcdcd33",

  // Provider badge colors (dark) - single token per provider type
  providerApi: "#93C5FD",
  providerLocal: "#86EFAC",
  providerHf: "#C4B5FD",

  primary: {
    main: "#60A5FA",
    light: "#93C5FD",
    dark: "#1D4ED8",
    contrastText: "#fff"
  },
  secondary: {
    main: "#A78BFA",
    light: "#C4B5FD",
    dark: "#6D28D9",
    contrastText: "#fff"
  },
  background: {
    default: "#0F1115",
    paper: "#161A22"
  },
  text: {
    primary: "#FFFFFF",
    secondary: "#C7D1E0",
    disabled: "#94A3B8"
  },
  action: {
    active: "#FFFFFF",
    hover: "#2A2F39",
    selected: "#1F2937",
    disabled: "#6B7280"
  },
  Paper: {
    default: "#161A22",
    paper: "#161A22",
    overlay: "#1C1F26"
  },
  divider: "#2C3340"
};
