/**
 * The `ui_svg_*` and `ui_audio_*` tool contracts: each tool's name,
 * description and argument shape, read by both hosts that register them. The
 * browser registry (`web/src/lib/tools/builtin/svg.ts`, `audio.ts`) adds the
 * `asset_id` it routes on; the headless eval bridges
 * (`packages/agents/src/evals/surfaces/svg.ts`, `audio.ts`) drive one implicit
 * asset and add nothing.
 *
 * The pure rules both hosts apply before touching a draft live here too, so a
 * call refused in one host is refused in the other with the same sentence:
 * {@link replaceExactlyOnce}, {@link audioRangeFromArgs} and
 * {@link validateAudioEffectParams}. Whether markup parses is each host's own
 * check, because the browser has `DOMParser` and Node does not.
 */

import { z } from "zod";
import type { UiToolContract } from "./ui-tool-contract.js";

// ---------------------------------------------------------------------------
// SVG
// ---------------------------------------------------------------------------

export const SVG_TOOL_CONTRACTS = {
  ui_svg_get_state: {
    description:
      "Read the specified SVG: its name, the full draft markup including unsaved edits, whether the draft differs from the saved asset, and any parse issues. Call this before editing.",
    shape: {}
  },
  ui_svg_set_markup: {
    description:
      "Replace the SVG's draft markup with a complete new document. The preview updates live and the user can undo the change. Markup that does not parse is rejected and the draft stays as it was. For a small change to a large file, use ui_svg_replace.",
    shape: {
      markup: z
        .string()
        .describe("The complete new SVG document, rooted at <svg>.")
    }
  },
  ui_svg_replace: {
    description:
      "Replace one exact passage of the SVG's draft markup. `find` must occur exactly once; include surrounding attributes to make it unique. The result must still parse. Read the markup with ui_svg_get_state first.",
    shape: {
      find: z
        .string()
        .min(1)
        .describe("Exact text to replace, copied from the markup."),
      replace: z
        .string()
        .describe("Text to put in its place. Empty deletes it.")
    }
  },
  ui_svg_save: {
    description:
      "Write the SVG's draft markup back to the asset, overwriting the saved file. Call it when the user asks to keep the edits.",
    shape: {}
  }
} satisfies Record<string, UiToolContract>;

export type SvgToolName = keyof typeof SVG_TOOL_CONTRACTS;

/**
 * `text` with its one occurrence of `find` replaced. Throws when `find` is
 * missing or occurs more than once, naming what the caller should do.
 */
export function replaceExactlyOnce(
  text: string,
  find: string,
  replace: string
): string {
  const at = text.indexOf(find);
  if (at < 0) {
    throw new Error(
      "`find` does not occur in the markup. Read it again with ui_svg_get_state and copy the passage exactly."
    );
  }
  if (text.indexOf(find, at + 1) >= 0) {
    throw new Error(
      "`find` occurs more than once. Include more of the surrounding markup so it matches one place."
    );
  }
  return text.slice(0, at) + replace + text.slice(at + find.length);
}

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------

/** The audio editor's toolbar edits, by the name the agent passes. */
export const AUDIO_EDIT_OPS = [
  "trim",
  "delete",
  "silence",
  "fade_in",
  "fade_out",
  "normalize",
  "reverse",
  "gain"
] as const;

export type AudioEditOp = (typeof AUDIO_EDIT_OPS)[number];

/** A region of the audio, in seconds. */
export interface AudioToolRange {
  start: number;
  end: number;
}

const rangeShape = {
  start: z
    .number()
    .min(0)
    .optional()
    .describe(
      "Range start in seconds. Pass with `end`; omit both for the whole audio."
    ),
  end: z
    .number()
    .min(0)
    .optional()
    .describe("Range end in seconds. Pass with `start`.")
};

/**
 * The range a call names, or undefined for the whole audio. Throws on half a
 * range or an empty one.
 */
export function audioRangeFromArgs(
  start?: number,
  end?: number
): AudioToolRange | undefined {
  if (start === undefined && end === undefined) return undefined;
  if (start === undefined || end === undefined) {
    throw new Error(
      "Pass both `start` and `end`, or neither for the whole audio."
    );
  }
  if (end <= start) {
    throw new Error("`end` must be after `start`.");
  }
  return { start, end };
}

/** Edits that make no sense over the whole audio. */
export const AUDIO_RANGE_REQUIRED_OPS: readonly AudioEditOp[] = [
  "trim",
  "delete"
];

export const AUDIO_TOOL_CONTRACTS = {
  ui_audio_get_state: {
    description:
      "Read the specified audio: name, duration, sample rate, channel count, whether there are unsaved edits, the region the user selected on the waveform, and a peak level (0-1) per window of `peakWindowSeconds`. Use the peaks to find silence (near 0) and loud passages. Call this before editing.",
    shape: {}
  },
  ui_audio_edit: {
    description:
      "Apply one edit to the audio over a range in seconds, or over the whole audio when the range is omitted. Ops: trim (keep only the range), delete (remove the range and join the rest), silence, fade_in, fade_out, normalize (peak to full scale), reverse, gain (by gain_db). trim and delete need a range. Each edit is one undo step for the user.",
    shape: {
      op: z.enum(AUDIO_EDIT_OPS),
      ...rangeShape,
      gain_db: z
        .number()
        .min(-60)
        .max(24)
        .optional()
        .describe(
          "Gain in decibels for op 'gain'. Positive boosts, negative cuts."
        )
    }
  },
  ui_audio_list_effects: {
    description:
      "List the effects ui_audio_apply_effect can run, with each one's parameters: key, range, unit and default.",
    shape: {}
  },
  ui_audio_apply_effect: {
    description:
      "Run one effect (equalizer, compressor, reverb, echo, speed, and others) over a range in seconds, or the whole audio when the range is omitted. Get the effect ids and parameter keys from ui_audio_list_effects. Omitted parameters use their defaults. Each effect is one undo step for the user.",
    shape: {
      effect_id: z.string().describe("Effect id from ui_audio_list_effects."),
      params: z
        .record(z.string(), z.number())
        .optional()
        .describe("Parameter values keyed by parameter key."),
      ...rangeShape
    }
  },
  ui_audio_save: {
    description:
      "Write the edited audio back to the asset as WAV, overwriting the saved file. Call it when the user asks to keep the edits.",
    shape: {}
  }
} satisfies Record<string, UiToolContract>;

export type AudioToolName = keyof typeof AUDIO_TOOL_CONTRACTS;

/** Tools that act on no asset, so neither host adds `asset_id` to them. */
export const AUDIO_ASSETLESS_TOOL_NAMES: readonly AudioToolName[] = [
  "ui_audio_list_effects"
];

export interface AudioEffectParamSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  unit: "dB" | "Hz" | "ms" | "s" | "%" | "×" | ":1" | "bits" | "";
}

export type AudioEffectGroup =
  | "Tone"
  | "Dynamics"
  | "Space"
  | "Character"
  | "Time";

/** What an effect is and takes. The browser editor adds how it renders. */
export interface AudioEffectSpec {
  id: string;
  label: string;
  group: AudioEffectGroup;
  description: string;
  /** Empty for effects that apply in one click without a dialog. */
  params: AudioEffectParamSpec[];
  /** Output length can differ from the input (speed). */
  changesLength?: boolean;
}

/**
 * The editor's effect catalog. `web/src/components/audio_editor/audioEffects.ts`
 * renders each one; its test pins that list to this one.
 */
export const AUDIO_EFFECT_SPECS: readonly AudioEffectSpec[] = [
  {
    id: "equalizer",
    label: "Equalizer",
    group: "Tone",
    description: "Boost or cut five frequency bands.",
    params: [
      { key: "low", label: "Low (80 Hz)", min: -18, max: 18, step: 0.5, defaultValue: 0, unit: "dB" },
      { key: "lowMid", label: "Low mid (250 Hz)", min: -18, max: 18, step: 0.5, defaultValue: 0, unit: "dB" },
      { key: "mid", label: "Mid (1 kHz)", min: -18, max: 18, step: 0.5, defaultValue: 0, unit: "dB" },
      { key: "highMid", label: "High mid (4 kHz)", min: -18, max: 18, step: 0.5, defaultValue: 0, unit: "dB" },
      { key: "high", label: "High (12 kHz)", min: -18, max: 18, step: 0.5, defaultValue: 0, unit: "dB" }
    ]
  },
  {
    id: "lowCut",
    label: "Low cut",
    group: "Tone",
    description: "Remove rumble and hum below a frequency (high-pass filter).",
    params: [
      { key: "frequency", label: "Frequency", min: 20, max: 1000, step: 1, defaultValue: 100, unit: "Hz" }
    ]
  },
  {
    id: "highCut",
    label: "High cut",
    group: "Tone",
    description: "Remove hiss and harshness above a frequency (low-pass filter).",
    params: [
      { key: "frequency", label: "Frequency", min: 500, max: 20000, step: 10, defaultValue: 8000, unit: "Hz" }
    ]
  },
  {
    id: "compressor",
    label: "Compressor",
    group: "Dynamics",
    description: "Even out loud and quiet parts.",
    params: [
      { key: "thresholdDb", label: "Threshold", min: -60, max: 0, step: 0.5, defaultValue: -18, unit: "dB" },
      { key: "ratio", label: "Ratio", min: 1, max: 20, step: 0.1, defaultValue: 4, unit: ":1" },
      { key: "kneeDb", label: "Knee", min: 0, max: 24, step: 0.5, defaultValue: 6, unit: "dB" },
      { key: "attackMs", label: "Attack", min: 0, max: 200, step: 0.5, defaultValue: 5, unit: "ms" },
      { key: "releaseMs", label: "Release", min: 10, max: 2000, step: 10, defaultValue: 150, unit: "ms" },
      { key: "makeupDb", label: "Makeup gain", min: 0, max: 24, step: 0.5, defaultValue: 0, unit: "dB" }
    ]
  },
  {
    id: "limiter",
    label: "Limiter",
    group: "Dynamics",
    description: "Stop peaks from going above a ceiling without clipping.",
    params: [
      { key: "inputDb", label: "Input gain", min: 0, max: 24, step: 0.5, defaultValue: 0, unit: "dB" },
      { key: "ceilingDb", label: "Ceiling", min: -24, max: 0, step: 0.1, defaultValue: -1, unit: "dB" },
      { key: "releaseMs", label: "Release", min: 1, max: 1000, step: 1, defaultValue: 80, unit: "ms" }
    ]
  },
  {
    id: "noiseGate",
    label: "Noise gate",
    group: "Dynamics",
    description: "Turn down background noise in the gaps between sounds.",
    params: [
      { key: "thresholdDb", label: "Threshold", min: -80, max: 0, step: 0.5, defaultValue: -40, unit: "dB" },
      { key: "reductionDb", label: "Reduction", min: -80, max: 0, step: 1, defaultValue: -60, unit: "dB" },
      { key: "attackMs", label: "Attack", min: 0, max: 100, step: 0.5, defaultValue: 2, unit: "ms" },
      { key: "holdMs", label: "Hold", min: 0, max: 500, step: 5, defaultValue: 50, unit: "ms" },
      { key: "releaseMs", label: "Release", min: 5, max: 1000, step: 5, defaultValue: 100, unit: "ms" }
    ]
  },
  {
    id: "reverb",
    label: "Reverb",
    group: "Space",
    description: "Place the sound in a room. The tail rings past the selection.",
    params: [
      { key: "decay", label: "Decay", min: 0.2, max: 8, step: 0.1, defaultValue: 2, unit: "s" },
      { key: "preDelayMs", label: "Pre-delay", min: 0, max: 200, step: 1, defaultValue: 20, unit: "ms" },
      { key: "tone", label: "Tone", min: 1000, max: 20000, step: 100, defaultValue: 8000, unit: "Hz" },
      { key: "mix", label: "Mix", min: 0, max: 100, step: 1, defaultValue: 35, unit: "%" }
    ]
  },
  {
    id: "echo",
    label: "Echo",
    group: "Space",
    description: "Repeat the sound with fading copies. Echoes ring past the selection.",
    params: [
      { key: "delayMs", label: "Delay", min: 20, max: 2000, step: 5, defaultValue: 350, unit: "ms" },
      { key: "feedback", label: "Feedback", min: 0, max: 90, step: 1, defaultValue: 40, unit: "%" },
      { key: "mix", label: "Mix", min: 0, max: 100, step: 1, defaultValue: 35, unit: "%" }
    ]
  },
  {
    id: "chorus",
    label: "Chorus",
    group: "Space",
    description: "Thicken the sound with a slowly moving copy of itself.",
    params: [
      { key: "rateHz", label: "Rate", min: 0.1, max: 8, step: 0.1, defaultValue: 1.2, unit: "Hz" },
      { key: "depthMs", label: "Depth", min: 0.5, max: 10, step: 0.1, defaultValue: 3, unit: "ms" },
      { key: "delayMs", label: "Delay", min: 5, max: 40, step: 0.5, defaultValue: 15, unit: "ms" },
      { key: "mix", label: "Mix", min: 0, max: 100, step: 1, defaultValue: 50, unit: "%" }
    ]
  },
  {
    id: "distortion",
    label: "Distortion",
    group: "Character",
    description: "Saturate and clip the signal for grit and warmth.",
    params: [
      { key: "driveDb", label: "Drive", min: 0, max: 40, step: 0.5, defaultValue: 12, unit: "dB" },
      { key: "outputDb", label: "Output", min: -24, max: 6, step: 0.5, defaultValue: -3, unit: "dB" },
      { key: "mix", label: "Mix", min: 0, max: 100, step: 1, defaultValue: 100, unit: "%" }
    ]
  },
  {
    id: "bitcrusher",
    label: "Bitcrusher",
    group: "Character",
    description: "Lo-fi digital grit from fewer bits and a lower sample rate.",
    params: [
      { key: "bits", label: "Bit depth", min: 1, max: 16, step: 1, defaultValue: 8, unit: "bits" },
      { key: "downsample", label: "Downsample", min: 1, max: 32, step: 1, defaultValue: 4, unit: "×" },
      { key: "mix", label: "Mix", min: 0, max: 100, step: 1, defaultValue: 100, unit: "%" }
    ]
  },
  {
    id: "tremolo",
    label: "Tremolo",
    group: "Character",
    description: "Pulse the volume up and down.",
    params: [
      { key: "rateHz", label: "Rate", min: 0.5, max: 20, step: 0.1, defaultValue: 5, unit: "Hz" },
      { key: "depth", label: "Depth", min: 0, max: 100, step: 1, defaultValue: 60, unit: "%" }
    ]
  },
  {
    id: "speed",
    label: "Change speed",
    group: "Time",
    description: "Speed up or slow down. Pitch moves with speed, like tape.",
    params: [
      { key: "rate", label: "Speed", min: 0.25, max: 4, step: 0.01, defaultValue: 1.25, unit: "×" }
    ],
    changesLength: true
  },
  {
    id: "invert",
    label: "Invert",
    group: "Character",
    description: "Flip the waveform's polarity.",
    params: []
  },
  {
    id: "removeDc",
    label: "Remove DC offset",
    group: "Tone",
    description: "Centre a waveform that sits above or below zero.",
    params: []
  }
];

/** The catalog as `ui_audio_list_effects` returns it. */
export const describeAudioEffects = () =>
  AUDIO_EFFECT_SPECS.map((effect) => ({
    id: effect.id,
    name: effect.label,
    group: effect.group,
    description: effect.description,
    changesLength: effect.changesLength ?? false,
    params: effect.params.map((p) => ({
      key: p.key,
      label: p.label,
      min: p.min,
      max: p.max,
      default: p.defaultValue,
      unit: p.unit
    }))
  }));

/**
 * The effect `effectId` names, after checking every key of `params` against
 * its parameters and their ranges. Returns the params with defaults filled in.
 */
export function validateAudioEffectParams(
  effectId: string,
  params: Record<string, number>
): { effect: AudioEffectSpec; params: Record<string, number> } {
  const effect = AUDIO_EFFECT_SPECS.find((spec) => spec.id === effectId);
  if (!effect) {
    throw new Error(
      `Unknown effect "${effectId}". Call ui_audio_list_effects for the ids.`
    );
  }
  for (const [key, value] of Object.entries(params)) {
    const spec = effect.params.find((p) => p.key === key);
    if (!spec) {
      throw new Error(
        `"${effectId}" has no parameter "${key}". Its parameters: ${
          effect.params.map((p) => p.key).join(", ") || "none"
        }.`
      );
    }
    if (!Number.isFinite(value) || value < spec.min || value > spec.max) {
      throw new Error(
        `"${key}" must be between ${spec.min} and ${spec.max}${spec.unit ? ` ${spec.unit}` : ""}.`
      );
    }
  }
  return {
    effect,
    params: {
      ...Object.fromEntries(effect.params.map((p) => [p.key, p.defaultValue])),
      ...params
    }
  };
}
