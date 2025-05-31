import { css } from "@emotion/react";

export const createStyles = (theme: any) =>
  css({
    padding: "2em",
    textAlign: "center",
    color: theme.palette.c_gray3,
    fontSize: "0.9em"
  });
