import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { getSpacingPx, SPACING } from "../../ui_primitives";

export const createStyles = (theme: Theme) =>
  css({
    padding: getSpacingPx(SPACING.xxxl),
    textAlign: "center",
    color: theme.vars.palette.grey[500],
    fontSize: theme.fontSizeSmall
  });
