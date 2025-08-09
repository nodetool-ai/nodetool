import "@emotion/react";
import type {} from "@mui/material/themeCssVarsAugmentation";
import { Theme as MuiTheme, CssVarsTheme } from "@mui/material/styles";

declare module "@emotion/react" {
  export interface Theme extends MuiTheme, CssVarsTheme {}
}
