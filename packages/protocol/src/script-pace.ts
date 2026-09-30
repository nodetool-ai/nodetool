import type { ScriptPace } from "./api-schemas/scripts.js";

/** Speech speed for a saved Script pace. Normal pace uses the provider default. */
export function paceSpeed(pace: ScriptPace | undefined): number | undefined {
  if (pace === "slow") {
    return 0.85;
  }
  if (pace === "fast") {
    return 1.15;
  }
  return undefined;
}
