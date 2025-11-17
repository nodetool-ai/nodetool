/** @jsxImportSource @emotion/react */
import type { SxProps, Theme } from "@mui/material/styles";
import { alpha } from "@mui/material/styles";

export const chipsContainerSx: SxProps<Theme> = {
  mt: 0.5,
  display: "flex",
  flexWrap: "wrap",
  gap: 0.5
};

type Tone = "primary" | "secondary" | "info";

export const chipSx = (
  theme: Theme,
  tone: Tone,
  options?: { uppercase?: boolean; maxWidth?: number }
): SxProps<Theme> => {
  const color = theme.palette[tone].main;
  const channel = theme.vars?.palette?.[tone]?.mainChannel;
  const translucent = (opacity: number) =>
    channel ? `rgba(${channel} / ${opacity})` : alpha(color, opacity);
  const { uppercase = true, maxWidth = 200 } = options ?? {};

  return {
    height: 22,
    borderRadius: "999px",
    maxWidth,
    minWidth: 0,
    overflow: "hidden",
    fontSize: "10px",
    fontWeight: 700,
    letterSpacing: "0.04em",
    px: 0.5,
    textTransform: uppercase ? "uppercase" : "none",
    color,
    bgcolor: translucent(0.08),
    borderColor: translucent(0.28),
    "& .MuiChip-label": {
      overflow: "hidden",
      textOverflow: "ellipsis",
      maxWidth: "100%",
      whiteSpace: "nowrap"
    }
  } as SxProps<Theme>;
};
