import { css } from "@emotion/react";

export const createStyles = (theme: Theme) =>
  css({
    padding: "2em",
    textAlign: "center",
    color: theme.palette.grey[500],
    fontSize: theme.fontSizeSmall
  });
