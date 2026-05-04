import { alpha, type SxProps, type Theme } from "@mui/material/styles";
import type { EraserMode, EraserSettings } from "../types";
import { toggleButtonSmallSx } from "../sketchStyles";

/** Reusable no-op function to avoid allocations in optional prop fallbacks. */
export const noop = () => {};

export const LOCAL_SAM3_NODE_PACK_HINT =
  "Install or enable the HuggingFace node pack";

export const IN_PROGRESS_DOWNLOAD_STATES = [
  "pending",
  "running",
  "start",
  "progress"
] as readonly string[];

/** Icon-only select-mode toggles; tooltips carry the descriptive label. */
export const selectModeToggleButtonSx: SxProps<Theme> = (theme) => ({
  ...toggleButtonSmallSx,
  minWidth: 30,
  px: 0.5,
  py: 0.5,
  "& .MuiSvgIcon-root": { fontSize: 18 },
  color: theme.vars?.palette?.text?.secondary ?? theme.palette.text.secondary,
  "&.Mui-selected": {
    color:
      theme.vars?.palette?.primary?.light ?? theme.palette.primary.light,
    backgroundColor: alpha(theme.palette.primary.main, 0.22),
    boxShadow: `inset 0 0 0 1px ${alpha(theme.palette.primary.main, 0.45)}`,
    "&:hover": {
      backgroundColor: alpha(theme.palette.primary.main, 0.3)
    }
  }
});

/** Matches {@link drawEraserStroke} / document migration so panel mode matches actual erase behavior. */
export function effectiveEraserMode(settings: EraserSettings): EraserMode {
  const raw = settings as EraserSettings & { tip?: EraserMode };
  return settings.mode ?? raw.tip ?? "brush";
}
