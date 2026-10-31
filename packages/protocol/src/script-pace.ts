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

/** Providers that take `speed` and do nothing with it. */
const PACE_BLIND_PROVIDERS: readonly string[] = [
  "gemini",
  "gemini_vertex",
  "google",
  "huggingface",
  "hf",
  "nodetool"
];

/** False when this provider reads at its own pace whatever the flow asks for. */
export function providerAppliesPace(provider: string): boolean {
  return !PACE_BLIND_PROVIDERS.includes(provider.toLowerCase());
}
