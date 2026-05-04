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
export const selectModeToggleButtonSx = {
  ...toggleButtonSmallSx,
  minWidth: 28,
  px: 0.375,
  py: 0.375,
  "& .MuiSvgIcon-root": { fontSize: 18 }
};

/** Matches {@link drawEraserStroke} / document migration so panel mode matches actual erase behavior. */
export function effectiveEraserMode(settings: EraserSettings): EraserMode {
  const raw = settings as EraserSettings & { tip?: EraserMode };
  return settings.mode ?? raw.tip ?? "brush";
}
