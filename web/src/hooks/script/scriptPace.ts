/**
 * Pace, as speech providers understand it (PRD § 9.3, § 9.5).
 *
 * The voices step offers slow, normal and fast, and the writer already aims a
 * word count at that pace. Until now nothing else read the setting: a sample
 * and a take were both synthesized at the provider's default rate, so a creator
 * could pick `slow`, press Voice, and hear exactly what `normal` produced (F12).
 * Every speech call the flow makes now carries the rate.
 *
 * `speed` reaches the provider through the `generate_media` RPC, and not every
 * provider applies it: Gemini, HuggingFace and the managed `nodetool` provider
 * accept the argument and read their own pace out of the text. A tile for one
 * of those says so rather than quietly reading at its own speed.
 */

import type { ScriptPace } from "@nodetool-ai/protocol/api-schemas/scripts.js";

/** The playback rate each pace asks for. `normal` sends nothing. */
const PACE_SPEED: Record<ScriptPace, number> = {
  slow: 0.85,
  normal: 1,
  fast: 1.15
};

/**
 * The `speed` to send with a speech call, or undefined when the request should
 * carry none — `normal` is the provider's own default, and sending 1 to a
 * provider that clamps or rejects the field buys nothing.
 */
export function paceSpeed(pace: ScriptPace | undefined): number | undefined {
  const speed = PACE_SPEED[pace ?? "normal"];
  return speed === 1 ? undefined : speed;
}

/** Providers that take `speed` and do nothing with it. */
const PACE_BLIND_PROVIDERS: readonly string[] = [
  "gemini",
  "google",
  "huggingface",
  "hf",
  "nodetool"
];

/** False when this provider reads at its own pace whatever the flow asks for. */
export function providerAppliesPace(provider: string): boolean {
  return !PACE_BLIND_PROVIDERS.includes(provider.toLowerCase());
}
