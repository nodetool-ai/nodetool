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
    main: "#E0E028",
    contrastText: "#000"
  },
  success: {
    main: "#50FA7B",
    contrastText: "#000"
  },
  grey: {
    0: "#fff", //  white
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
  },
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
  c_link: "#e4ffde",
  c_link_visited: "#d1e2cd",
  c_scroll_bg: "transparent",
  c_scroll_hover: "#585858",
  c_scroll_thumb: "#535353",
  c_node_bg: "#2a2a2a",
  c_node_bg_group: "#3d3d3d",
  c_node_header_bg: "#202020",
  c_node_header_bg_group: "#444",
  c_bg_loop: "#305c9d17",
  c_bg_group: "#9bcfdb17",
  c_editor_bg_color: "#111",
  c_editor_grid_color: "#313131",
  c_editor_axis_color: "#292929",
  c_selection_rect: "#cdcdcd33",

  primary: {
    main: "#77b4e6",
    light: "#9bc5f0",
    dark: "#4a7bc4",
    contrastText: "#000"
  },
  secondary: {
    main: "#d23f9e",
    light: "#e993c5",
    dark: "#ba008a",
    contrastText: "#fff"
  },
  background: {
    default: "#0d0d0d",
    paper: "#232323"
  },
  text: {
    primary: "#fff",
    secondary: "#ddd",
    disabled: "#aaa"
  },
  action: {
    active: "#fff",
    hover: "#444",
    selected: "#aaa",
    disabled: "#666"
  },
  Paper: {
    default: "#232323",
    paper: "#232323",
    overlay: "#2a2a2a"
  },
  divider: "#555"
};
