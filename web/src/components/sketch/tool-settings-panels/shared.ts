import type { EraserMode, EraserSettings } from "../types";

/** Reusable no-op function to avoid allocations in optional prop fallbacks. */
export const noop = () => {};

/** Matches {@link drawEraserStroke} / document migration so panel mode matches actual erase behavior. */
export function effectiveEraserMode(settings: EraserSettings): EraserMode {
  const raw = settings as EraserSettings & { tip?: EraserMode };
  return settings.mode ?? raw.tip ?? "brush";
}
