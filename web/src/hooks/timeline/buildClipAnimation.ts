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
  CUSTOM_ANIMATION_PRESET_ID,
  getAnimationPreset,
  normalizeCustomCurves,
  resolveCustomMask,
  type ClipAnimation
} from "@nodetool-ai/timeline";
import type { ClipAnimationInput } from "../../components/timeline/timelineAgentBridge";

export function buildClipAnimation(input: ClipAnimationInput): ClipAnimation {
  if (input.preset === CUSTOM_ANIMATION_PRESET_ID) {
    return buildCustomClipAnimation(input);
  }
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
  if (input.stagger !== undefined) {
    if (input.stagger.unit !== "word") {
      throw new Error(
        `Unknown stagger unit "${input.stagger.unit}". Only "word" is supported.`
      );
    }
    if (
      !Number.isFinite(input.stagger.offsetMs) ||
      input.stagger.offsetMs <= 0
    ) {
      throw new Error("Stagger offsetMs must be a positive finite number.");
    }
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
  if (input.stagger !== undefined) {
    const stagger: NonNullable<ClipAnimation["stagger"]> = {
      unit: input.stagger.unit,
      offsetMs: input.stagger.offsetMs
    };
    if (input.stagger.from !== undefined) stagger.from = input.stagger.from;
    anim.stagger = stagger;
  }
  return anim;
}

/**
 * `preset: "custom"` — keyframes the caller writes out, rather than a name
 * from the catalog. The editor bakes nothing: a `code` body is baked host-side
 * through the agent path, and refusing it here is better than accepting the
 * field and dropping the motion on the floor.
 */
function buildCustomClipAnimation(input: ClipAnimationInput): ClipAnimation {
  if (input.code !== undefined) {
    throw new Error(
      'A "code" body is baked host-side; the editor cannot run one. ' +
        "Send the keyframes as `curves`, or author the animation through " +
        "edit_timeline."
    );
  }
  if (input.curves === undefined) {
    throw new Error(
      'preset "custom" needs `curves`: ' +
        "[{property, keyframes: [{t, value, easing?}]}], t running 0..1."
    );
  }
  const baked = normalizeCustomCurves(input.curves);
  if (!baked.ok) {
    throw new Error(`Custom animation curves are unusable: ${baked.error}.`);
  }
  const mask = resolveCustomMask(baked.curves, input.mask);
  if (!mask.ok) {
    throw new Error(mask.error);
  }
  const durationMs = input.durationMs;
  if (
    durationMs !== undefined &&
    (!Number.isFinite(durationMs) || durationMs <= 0)
  ) {
    throw new Error("Animation durationMs must be a positive finite number.");
  }
  const custom: NonNullable<ClipAnimation["custom"]> = {
    curves: baked.curves,
    bakedAt: new Date().toISOString()
  };
  if (mask.mask !== undefined) custom.mask = mask.mask;
  const anim: ClipAnimation = {
    id: crypto.randomUUID(),
    role: input.role,
    preset: CUSTOM_ANIMATION_PRESET_ID,
    durationMs: durationMs ?? 0,
    custom
  };
  if (input.delayMs !== undefined) {
    if (!Number.isFinite(input.delayMs) || input.delayMs < 0) {
      throw new Error("Animation delayMs must be a non-negative finite number.");
    }
    anim.delayMs = input.delayMs;
  }
  if (input.easing !== undefined) {
    anim.easing = input.easing as ClipAnimation["easing"];
  }
  if (input.enabled !== undefined) anim.enabled = input.enabled;
  return anim;
}
