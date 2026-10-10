import type { ColorSystemOptions } from "@mui/material/styles";

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
    c_gray0?: string;
    c_gray1?: string;
    c_gray2?: string;
    c_gray3?: string;
    c_gray4?: string;
    c_gray5?: string;
    c_gray6?: string;
    c_hl1?: string;
    c_hl2?: string;

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
    c_gray0?: string;
    c_gray1?: string;
    c_gray2?: string;
    c_gray3?: string;
    c_gray4?: string;
    c_gray5?: string;
    c_gray6?: string;
    c_hl1?: string;
    c_hl2?: string;

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

// Light scheme: cool neutral greys, white working surfaces on a soft grey
// shell, hairline borders instead of heavy fills, and the same brand blue as
// the dark scheme (tuned darker so text and icons on white pass WCAG AA).
export const paletteLight: NonNullable<ColorSystemOptions["palette"]> = {
  error: {
    main: "#D92D20",
    light: "#F97066",
    dark: "#B42318",
    contrastText: "#FFFFFF"
  },
  warning: {
    main: "#DC6803",
    light: "#FDB022",
    dark: "#B54708",
    contrastText: "#FFFFFF"
  },
  info: {
    main: "#0E7490",
    light: "#22A5C4",
    dark: "#155E75",
    contrastText: "#FFFFFF"
  },
  success: {
    main: "#16A34A",
    light: "#4ADE80",
    dark: "#15803D",
    contrastText: "#FFFFFF"
  },
  grey: {
    0: "#09090B",
    50: "#18181B",
    100: "#27272A",
    200: "#3F3F46",
    300: "#52525B",
    400: "#71717A",
    500: "#A1A1AA",
    600: "#CDCDD3",
    700: "#E4E4E7",
    800: "#EEEEF0",
    900: "#F5F5F6",
    1000: "#FFFFFF"
  },
  c_black: "#09090B",
  c_bg_comment: "#FFFFFF",
  c_brightest: "#FFFFFF",
  c_white: "#FFFFFF",
  c_background: "#F5F5F6",
  c_node_menu: "#FFFFFF",
  c_selection: "#2F62C440",
  c_input: "#EEF3FB",
  c_output: "#F4F0FA",
  c_attention: "#B13BCF",
  c_delete: "#D92D20",
  c_debug: "#DB2777",
  c_job: "#3A57C9",
  c_node: "#0D9488",
  c_folder: "#D99A3B",
  c_progress: "#16A34A",
  c_link: "#2F62C4",
  c_link_visited: "#6B4FBB",
  c_scroll_bg: "transparent",
  c_scroll_hover: "#A1A1AA",
  c_scroll_thumb: "#D4D4D8",
  c_node_bg: "#FFFFFF",
  c_node_bg_group: "#FAFAFB",
  c_node_header_bg: "#FFFFFF",
  c_node_header_bg_group: "#F5F5F6",
  c_bg_loop: "#2F62C40D",
  c_bg_group: "#71717A12",
  c_editor_bg_color: "#F6F6F8",
  c_editor_grid_color: "#D9D9DF",
  c_editor_axis_color: "#E4E4E7",
  c_selection_rect: "rgba(47, 98, 196, 0.08)",
  // Media/dialog scrims — intentionally dark in both schemes
  c_scrim_soft: "rgba(0, 0, 0, 0.3)",
  c_scrim: "rgba(0, 0, 0, 0.6)",
  c_scrim_strong: "rgba(0, 0, 0, 0.85)",
  // Subtle raised-surface tints (black-on-light)
  c_overlay_subtle: "rgba(24, 24, 27, 0.025)",
  c_overlay: "rgba(24, 24, 27, 0.045)",
  c_overlay_strong: "rgba(24, 24, 27, 0.09)",
  c_shadow_alpha: "0.45",
  c_provider_api: "#2F62C4",
  c_provider_local: "#047857",
  c_provider_hf: "#7C3AED",
  c_app_header: "#FFFFFF",
  c_tabs_header: "#F5F5F6",
  c_gray0: "#FFFFFF",
  c_gray1: "#F5F5F6",
  c_gray2: "#E4E4E7",
  c_gray3: "#CDCDD3",
  c_gray4: "#A1A1AA",
  c_gray5: "#71717A",
  c_gray6: "#52525B",
  c_hl1: "#2F62C4",
  c_hl2: "#244E9E",

  // Provider badge colors (light) - single token per provider type
  providerApi: "#2F62C4",
  providerLocal: "#047857",
  providerHf: "#7C3AED",

  primary: {
    main: "#2F62C4",
    light: "#4F7FD8",
    dark: "#244E9E",
    contrastText: "#FFFFFF"
  },
  secondary: {
    main: "#B13BCF",
    light: "#D18AE3",
    dark: "#8A2BA3",
    contrastText: "#FFFFFF"
  },
  background: {
    default: "#F5F5F6",
    paper: "#FFFFFF"
  },
  text: {
    primary: "#18181B",
    secondary: "#5B5B66",
    disabled: "#A1A1AA"
  },
  action: {
    active: "rgba(24, 24, 27, 0.7)",

    hover: "rgba(24, 24, 27, 0.04)",
    hoverOpacity: 0.04,

    selected: "rgba(24, 24, 27, 0.07)",
    selectedOpacity: 0.07,

    disabled: "rgba(24, 24, 27, 0.3)",
    disabledOpacity: 0.38,

    disabledBackground: "rgba(24, 24, 27, 0.08)",

    focus: "rgba(47, 98, 196, 0.32)",
    focusOpacity: 0.32,

    activatedOpacity: 0.12
  },
  Paper: {
    default: "#FFFFFF",
    paper: "#FAFAFB",
    overlay: "#F2F2F4"
  },
  divider: "#E4E4E7",
  // MUI derives these from fixed grey indices that assume a light-to-dark
  // scale. The NodeTool grey scale runs dark-to-light in this scheme, so the
  // defaults would draw near-black chip outlines and switch tracks.
  AppBar: { defaultBg: "#FFFFFF" },
  Avatar: { defaultBg: "#CDCDD3" },
  Button: { inheritContainedBg: "#EEEEF0", inheritContainedHoverBg: "#E4E4E7" },
  Chip: {
    defaultBorder: "#DCDCE1",
    defaultAvatarColor: "#52525B",
    defaultIconColor: "#52525B"
  },
  // `border` is MUI's palette key here, not a CSS property.
  // eslint-disable-next-line design-tokens/color-tokens
  StepConnector: { border: "#D4D4D8" },
  // eslint-disable-next-line design-tokens/color-tokens
  StepContent: { border: "#D4D4D8" },
  Switch: { defaultDisabledColor: "#F5F5F6" },
  glass: {
    blur: "blur(20px) saturate(180%)",
    backgroundDialog: "rgba(255, 255, 255, 0.72)",
    backgroundDialogContent: "rgba(255, 255, 255, 0.88)"
  }
};
