import type { Preset, PresetMode } from "./schema.js";

/** The most presets one request can apply. */
export const MAX_PRESET_STACK = 3;

export type PresetBlockReason =
  | "limit"
  | "mode"
  | "duplicate"
  | "not-stackable"
  | "slot"
  | "conflict";

export interface PresetBlock {
  reason: PresetBlockReason;
  /** The preset that blocks the candidate, when one does. */
  other?: Preset;
}

/** Why two presets cannot share a stack, or null when they can. */
export function presetPairBlock(a: Preset, b: Preset): PresetBlock | null {
  if (a.id === b.id) { return { reason: "duplicate", other: a }; }
  if (!a.stackable) { return { reason: "not-stackable", other: a }; }
  if (!b.stackable) { return { reason: "not-stackable", other: b }; }
  if (a.slot && a.slot === b.slot) { return { reason: "slot", other: a }; }
  if (a.conflicts.includes(b.id) || b.conflicts.includes(a.id)) { return { reason: "conflict", other: a }; }
  return null;
}

/**
 * Whether `candidate` can join `selection` under the compiler's rules: at most
 * three presets, a supported mode, and every pair stackable with distinct
 * slots and no declared conflict. `compilePresets` applies the same pair rules.
 */
export function canAddPreset(
  selection: readonly Preset[],
  candidate: Preset,
  options: { mode?: PresetMode } = {}
): { ok: true } | ({ ok: false } & PresetBlock) {
  if (options.mode && !candidate.modes.includes(options.mode)) { return { ok: false, reason: "mode" }; }
  if (selection.some((preset) => preset.id === candidate.id)) {
    return { ok: false, reason: "duplicate", other: candidate };
  }
  if (selection.length >= MAX_PRESET_STACK) { return { ok: false, reason: "limit" }; }
  for (const preset of selection) {
    const block = presetPairBlock(preset, candidate);
    if (block) { return { ok: false, ...block }; }
  }
  return { ok: true };
}
