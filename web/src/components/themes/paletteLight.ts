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

export const paletteLight: PaletteOptions = {
  error: {
    main: "#FF5555",
    contrastText: "#fff"
  },
  warning: {
    main: "#FFB86C",
    contrastText: "#000"
  },
  info: {
    main: "#B0B620",
    contrastText: "#000"
  },
  success: {
    main: "#50FA7B",
    contrastText: "#000"
  },
  grey: {
    0: "#000", // black
    50: "#0E0E0E", // from c_gray0
    100: "#242424", // from c_gray1
    200: "#333333", // spare
    300: "#444444", // from c_gray2
    400: "#6D6D6D", // from c_gray3
    500: "#959595", // from c_gray4
    600: "#A9A9A9", // spare
    700: "#BDBDBD", // from c_gray5
    800: "#D9D9D9", // from c_gray6
    900: "#F5F5F5", // Standard MUI light grey
    1000: "#fff" //  white
  },
  c_black: "#020202",
  c_bg_comment: "#fff",
  c_brightest: "#FCFCFC",
  c_white: "#FCFCFC",
  c_background: "#424854",
  c_node_menu: "#ccc",
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
  c_node_bg: "#f9f9f9",
  c_node_bg_group: "#fffeff",
  c_node_header_bg: "#dfdfdf",
  c_node_header_bg_group: "#444",
  c_bg_loop: "#305c9d17",
  c_bg_group: "#dfdfdf",
  c_editor_bg_color: "#e3e3e3",
  c_editor_grid_color: "#ccc",
  c_editor_axis_color: "#bbb",
  c_selection_rect: "rgba(0, 150, 20, 0.08)",

  primary: {
    main: "#009911",
    light: "#33cc44",
    dark: "#006611",
    contrastText: "#000"
  },
  secondary: {
    main: "#d23f9e",
    light: "#e993c5",
    dark: "#ba008a",
    contrastText: "#fff"
  },
  background: {
    default: "#fff",
    paper: "#f2f2f2"
  },
  text: {
    primary: "#000",
    secondary: "#333",
    disabled: "#777"
  },
  action: {
    active: "#000",
    hover: "#333",
    selected: "#555",
    disabled: "#777"
  },
  Paper: {
    default: "#eee",
    paper: "#ddd",
    overlay: "#dedede"
  },
  divider: "#999"
};
