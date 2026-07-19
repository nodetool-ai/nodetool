/**
 * buildClipAnimation
 *
 * Validate an agent-requested animation against the preset catalog and fill in
 * defaults (duration, a fresh id). Pure, so the agent handler and its tests
 * share one code path. Throws with the valid options listed when the preset is
 * unknown or the role is not allowed for it — the tool layer surfaces the throw
 * to the agent.
 */

import {
  ANIMATION_PRESETS,
  getAnimationPreset,
  type ClipAnimation
} from "@nodetool-ai/timeline";
import type { ClipAnimationInput } from "../../components/timeline/timelineAgentBridge";

export function buildClipAnimation(input: ClipAnimationInput): ClipAnimation {
  const preset = getAnimationPreset(input.preset);
  if (!preset) {
    const valid = ANIMATION_PRESETS.map((p) => p.id).join(", ");
    throw new Error(
      `Unknown animation preset "${input.preset}". Valid presets: ${valid}.`
    );
  }
  if (!preset.roles.includes(input.role)) {
    throw new Error(
      `Preset "${preset.id}" does not support role "${input.role}". ` +
        `Allowed roles: ${preset.roles.join(", ")}.`
    );
  }
  const durationMs = input.durationMs ?? preset.defaultDurationMs;
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error("Animation durationMs must be a positive finite number.");
  }
  if (
    input.delayMs !== undefined &&
    (!Number.isFinite(input.delayMs) || input.delayMs < 0)
  ) {
    throw new Error("Animation delayMs must be a non-negative finite number.");
  }

  const anim: ClipAnimation = {
    id: crypto.randomUUID(),
    role: input.role,
    preset: input.preset,
    durationMs
  };
  if (input.delayMs !== undefined) anim.delayMs = input.delayMs;
  // Easing is validated at sample time (unknown ids fall back to linear), so
  // the wire value passes straight through.
  if (input.easing !== undefined) {
    anim.easing = input.easing as ClipAnimation["easing"];
  }
  if (input.enabled !== undefined) anim.enabled = input.enabled;
  if (input.params !== undefined) anim.params = input.params;
  return anim;
}
