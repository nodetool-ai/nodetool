import { css } from "@emotion/react";

export const createStyles = (theme: any) =>
  css({
    padding: "2em",
    textAlign: "center",
    color: theme.palette.grey[500],
    fontSize: "0.9em"
  });
