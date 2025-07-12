import "@emotion/react";
import { Theme as MuiTheme } from "@mui/material/styles";

declare module "@emotion/react" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface Theme extends MuiTheme {}
}
