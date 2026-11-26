import type { Theme } from "@mui/material/styles";
import { SPACING } from "../../ui_primitives";

/** `.controls` grid with `.ctrl-label` and `.ctrl-value` cells, shared by the bespoke slider bodies. */
export const controlGridStyles = (
  theme: Theme,
  rowGap: keyof typeof SPACING,
  valueMinWidth: number
) => ({
  ".controls": {
    flex: "0 0 auto",
    display: "grid",
    gridTemplateColumns: "minmax(0, auto) minmax(40px, 1fr) auto",
    columnGap: theme.spacing(SPACING.xs),
    rowGap: theme.spacing(SPACING[rowGap]),
    alignItems: "center",
    padding: `${theme.spacing(SPACING.micro)} ${theme.spacing(SPACING.xs)} ${theme.spacing(SPACING.micro)}`
  },
  ".ctrl-label": {
    fontSize: theme.fontSizeSmaller,
    color: theme.vars.palette.text.secondary,
    letterSpacing: "normal",
    lineHeight: 1
  },
  ".ctrl-value": {
    fontFamily: theme.fontFamily2,
    fontSize: theme.fontSizeSmaller,
    color: theme.vars.palette.text.primary,
    minWidth: valueMinWidth,
    textAlign: "right" as const,
    lineHeight: 1
  }
});
