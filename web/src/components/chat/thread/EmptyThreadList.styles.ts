import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";

export const createStyles = (theme: Theme) =>
  css({
    padding: "2em",
    textAlign: "center",
    color: theme.vars.palette.grey[500],
    fontSize: theme.fontSizeSmall
  });
