/**
 * Headless bridge for the audio editor tool-loop eval.
 *
 * The browser tools (`web/src/lib/tools/builtin/audio.ts`) delegate to the
 * handler an open `AudioSampleEditor` registers: it edits decoded PCM, renders
 * effects through Web Audio, and saves WAV back to the asset. This bridge
 * holds a mono PCM buffer at a low sample rate and applies the same edits to
 * it, so a model can drive the `ui_audio_*` surface with no browser.
 *
 * Names, descriptions, argument shapes, the range rule and the effect catalog
 * with its parameter checks come from the shared contracts in
 * `@nodetool-ai/protocol/api-schemas/asset-editor-tool-contracts`. Effects are
 * validated exactly as the browser validates them but not rendered, since
 * rendering needs an `OfflineAudioContext`: each one is recorded with its
 * parameters, and `speed` changes the length the way the real render does.
 * The bridge drives one implicit asset, so no tool takes `asset_id`.
 */

import { parseWithTypeCoercion } from "@nodetool-ai/runtime";
import {
  AUDIO_TOOL_CONTRACTS,
  audioRangeFromArgs,
  describeAudioEffects,
  validateAudioEffectParams,
  type AudioEditOp,
  type AudioToolName,
  type AudioToolRange
} from "@nodetool-ai/protocol/api-schemas/asset-editor-tool-contracts.js";
import { uiToolParams } from "@nodetool-ai/protocol/api-schemas/ui-tool-contract.js";
import type { HeadlessTool } from "../tool-loop-bridge.js";
import type {
  HeadlessSurfaceBridge,
  ToolLoopEvalCase
} from "../tool-loop-eval.js";

/** Low enough to keep the buffers small, high enough for 10 ms precision. */
export const AUDIO_BRIDGE_SAMPLE_RATE = 100;

/** One stretch of the seeded audio: a constant level for some seconds. */
export interface AudioBridgeSegment {
  seconds: number;
  level: number;
}

export interface AudioBridgeInitialState {
  name?: string;
  segments: AudioBridgeSegment[];
  selection?: AudioToolRange | null;
}

export interface AudioBridgeEffectRecord {
  effectId: string;
  params: Record<string, number>;
  range: AudioToolRange | null;
}

export interface AudioBridgeFinalState {
  durationSeconds: number;
  /** Peak level of each 0.1 s window. */
  peaks: number[];
  edits: { op: AudioEditOp; range: AudioToolRange | null; gainDb?: number }[];
  effects: AudioBridgeEffectRecord[];
  dirty: boolean;
  saves: number;
}

const MAX_PEAK_WINDOWS = 120;

function tool(
  name: AudioToolName,
  impl: (args: Record<string, unknown>) => Promise<unknown>
): HeadlessTool {
  const parameters = uiToolParams(AUDIO_TOOL_CONTRACTS[name]);
  return {
    name,
    description: AUDIO_TOOL_CONTRACTS[name].description,
    parameters,
    execute: (args) =>
      impl(
        parseWithTypeCoercion(parameters, args ?? {}) as Record<string, unknown>
      )
  };
}

const peaksOf = (
  samples: Float32Array,
  windowFrames: number
): number[] => {
  const peaks: number[] = [];
  for (let start = 0; start < samples.length; start += windowFrames) {
    let peak = 0;
    const end = Math.min(samples.length, start + windowFrames);
    for (let i = start; i < end; i += 1) {
      peak = Math.max(peak, Math.abs(samples[i]));
    }
    peaks.push(Math.round(Math.min(1, peak) * 100) / 100);
  }
  return peaks;
};

export function createAudioToolBridge(
  initial: AudioBridgeInitialState
): HeadlessSurfaceBridge<AudioBridgeFinalState> {
  const name = initial.name ?? "take.wav";
  const rate = AUDIO_BRIDGE_SAMPLE_RATE;
  const seeded: number[] = [];
  for (const segment of initial.segments) {
    const frames = Math.round(segment.seconds * rate);
    for (let i = 0; i < frames; i += 1) {
      // Alternate sign so the level reads as a waveform, not a DC offset.
      seeded.push(i % 2 === 0 ? segment.level : -segment.level);
    }
  }
  let samples: Float32Array = Float32Array.from(seeded);
  let saved = samples;
  let saves = 0;
  let selection = initial.selection ?? null;
  const edits: AudioBridgeFinalState["edits"] = [];
  const effects: AudioBridgeEffectRecord[] = [];

  const duration = () => samples.length / rate;
  const frameRange = (range?: AudioToolRange) => {
    const clamp = (seconds: number) =>
      Math.max(0, Math.min(samples.length, Math.round(seconds * rate)));
    return range
      ? { start: clamp(range.start), end: clamp(range.end) }
      : { start: 0, end: samples.length };
  };

  const commit = (next: Float32Array) => {
    samples = next;
    if (selection && selection.end > duration()) {
      selection = null;
    }
  };

  const applyEdit = (
    op: AudioEditOp,
    range: AudioToolRange | undefined,
    gainDb: number | undefined
  ) => {
    if ((op === "trim" || op === "delete") && !range) {
      throw new Error(
        `"${op}" needs a range: pass start and end in seconds. To use the user's selection, pass the selection from ui_audio_get_state.`
      );
    }
    if (op === "gain" && (gainDb === undefined || !Number.isFinite(gainDb))) {
      throw new Error('"gain" needs gain_db, e.g. 6 to boost or -6 to cut.');
    }
    const { start, end } = frameRange(range);
    const out = samples.slice();
    const span = end - start;
    switch (op) {
      case "trim":
        commit(samples.slice(start, end));
        selection = null;
        return;
      case "delete": {
        const joined = new Float32Array(samples.length - span);
        joined.set(samples.subarray(0, start), 0);
        joined.set(samples.subarray(end), start);
        commit(joined);
        selection = null;
        return;
      }
      case "silence":
        out.fill(0, start, end);
        break;
      case "fade_in":
      case "fade_out": {
        const denom = span > 1 ? span - 1 : 1;
        for (let i = 0; i < span; i += 1) {
          const t = i / denom;
          out[start + i] *= op === "fade_in" ? t : 1 - t;
        }
        break;
      }
      case "normalize": {
        let peak = 0;
        for (let i = start; i < end; i += 1) {
          peak = Math.max(peak, Math.abs(samples[i]));
        }
        if (peak > 0) {
          for (let i = start; i < end; i += 1) out[i] /= peak;
        }
        break;
      }
      case "reverse":
        out.set(samples.slice(start, end).reverse(), start);
        break;
      case "gain": {
        const factor = 10 ** ((gainDb as number) / 20);
        for (let i = start; i < end; i += 1) out[i] *= factor;
        break;
      }
    }
    commit(out);
  };

  const snapshot = () => {
    const windowSeconds = Math.max(
      0.1,
      Math.ceil((duration() / MAX_PEAK_WINDOWS) * 10) / 10
    );
    return {
      assetId: "audio",
      name,
      durationSeconds: duration(),
      sampleRate: rate,
      channels: 1,
      dirty: samples !== saved,
      selection,
      peaks: peaksOf(samples, Math.round(windowSeconds * rate)),
      peakWindowSeconds: windowSeconds
    };
  };

  const changed = () => ({
    ok: true,
    durationSeconds: duration(),
    dirty: samples !== saved,
    url: "asset://audio"
  });

  const tools: HeadlessTool[] = [
    tool("ui_audio_get_state", async () => ({ ok: true, ...snapshot() })),
    tool("ui_audio_edit", async (args) => {
      const op = args.op as AudioEditOp;
      const range = audioRangeFromArgs(
        args.start as number | undefined,
        args.end as number | undefined
      );
      const gainDb = args.gain_db as number | undefined;
      applyEdit(op, range, gainDb);
      const record: AudioBridgeFinalState["edits"][number] = {
        op,
        range: range ?? null
      };
      if (gainDb !== undefined) {
        record.gainDb = gainDb;
      }
      edits.push(record);
      return changed();
    }),
    tool("ui_audio_list_effects", async () => ({
      ok: true,
      effects: describeAudioEffects()
    })),
    tool("ui_audio_apply_effect", async (args) => {
      const range = audioRangeFromArgs(
        args.start as number | undefined,
        args.end as number | undefined
      );
      const checked = validateAudioEffectParams(
        args.effect_id as string,
        (args.params as Record<string, number> | undefined) ?? {}
      );
      const { start, end } = frameRange(range);
      if (checked.effect.id === "speed") {
        const factor = checked.params.rate;
        const section = samples.slice(start, end);
        const stretched = new Float32Array(Math.round(section.length / factor));
        for (let i = 0; i < stretched.length; i += 1) {
          stretched[i] = section[Math.min(section.length - 1, Math.floor(i * factor))];
        }
        const out = new Float32Array(samples.length - section.length + stretched.length);
        out.set(samples.subarray(0, start), 0);
        out.set(stretched, start);
        out.set(samples.subarray(end), start + stretched.length);
        commit(out);
        selection = null;
      } else {
        // Recorded, not rendered: a new buffer marks the draft edited.
        commit(samples.slice());
      }
      effects.push({
        effectId: checked.effect.id,
        params: checked.params,
        range: range ?? null
      });
      return changed();
    }),
    tool("ui_audio_save", async () => {
      if (samples !== saved) {
        saved = samples;
        saves += 1;
      }
      return { ok: true, dirty: false, url: "asset://audio" };
    })
  ];

  return {
    tools,
    finalState: () => ({
      durationSeconds: duration(),
      peaks: peaksOf(samples, Math.round(0.1 * rate)),
      edits: edits.map((edit) => ({ ...edit })),
      effects: effects.map((effect) => ({ ...effect })),
      dirty: samples !== saved,
      saves
    })
  };
}

const AUDIO_SYSTEM_PROMPT = `You are an assistant editing an audio asset the user has open, through UI tools.

- Call ui_audio_get_state first. Its peaks list is the level of each window of peakWindowSeconds: near 0 is silence.
- Edit with ui_audio_edit (trim, delete, silence, fade_in, fade_out, normalize, reverse, gain) over a range in seconds, or the whole audio.
- Run effects with ui_audio_apply_effect. Read the ids and parameter keys from ui_audio_list_effects first.
- Edits stay in the editor's draft. Call ui_audio_save only when the user asks to keep or save the result.

Call one tool at a time and use the result before the next call. When the objective is satisfied, stop calling tools and give a one-line summary.`;

const near = (value: number, target: number, tolerance: number) =>
  Math.abs(value - target) <= tolerance;

export const AUDIO_TOOL_LOOP_CASES: readonly ToolLoopEvalCase<AudioBridgeFinalState>[] =
  [
    {
      id: "trim-leading-silence",
      description: "Cut the silence before the take starts, then save",
      objective:
        "This recording starts with dead air before anyone speaks. Remove the silence at the start and save the audio.",
      createBridge: () =>
        createAudioToolBridge({
          segments: [
            { seconds: 2, level: 0 },
            { seconds: 3, level: 0.6 }
          ]
        }),
      systemPrompt: AUDIO_SYSTEM_PROMPT,
      expect: {
        requiredTools: ["ui_audio_get_state", "ui_audio_edit", "ui_audio_save"],
        ordering: [["ui_audio_get_state", "ui_audio_edit"]],
        noErrorResults: true,
        minToolCalls: 3,
        maxToolCalls: 8,
        finalState: [
          {
            name: "silenceRemoved",
            detail: "the first 0.2 s are still silent",
            test: (s) => s.peaks.slice(0, 2).every((peak) => peak > 0.1)
          },
          {
            name: "speechKept",
            detail: "the 3 s of speech did not survive intact",
            test: (s) => near(s.durationSeconds, 3, 0.2)
          },
          {
            name: "saved",
            detail: "the edit was not saved",
            test: (s) => s.saves === 1 && !s.dirty
          }
        ]
      }
    },
    {
      id: "fade-out-ending",
      description: "Fade out the last second without saving",
      objective:
        "Fade out the last second of this clip. Don't save it yet.",
      createBridge: () =>
        createAudioToolBridge({ segments: [{ seconds: 4, level: 0.8 }] }),
      systemPrompt: AUDIO_SYSTEM_PROMPT,
      expect: {
        requiredTools: ["ui_audio_edit"],
        forbiddenTools: ["ui_audio_save"],
        noErrorResults: true,
        minToolCalls: 1,
        maxToolCalls: 6,
        finalState: [
          {
            name: "lengthKept",
            detail: "the clip is no longer 4 s",
            test: (s) => near(s.durationSeconds, 4, 0.01)
          },
          {
            name: "fadedOut",
            detail: "the last fade window is not quiet",
            test: (s) => (s.peaks.at(-1) ?? 1) < 0.15
          },
          {
            name: "startUntouched",
            detail: "the first three seconds lost level",
            test: (s) => s.peaks.slice(0, 29).every((peak) => peak >= 0.75)
          },
          {
            name: "unsaved",
            detail: "the draft was saved although the user said not to",
            test: (s) => s.saves === 0 && s.dirty
          }
        ]
      }
    },
    {
      id: "reverb-with-mix",
      description: "Add reverb at a 50% mix over the whole clip",
      objective:
        "Add reverb to the whole clip with the wet/dry mix at 50%. Leave the other reverb settings at their defaults.",
      createBridge: () =>
        createAudioToolBridge({ segments: [{ seconds: 3, level: 0.5 }] }),
      systemPrompt: AUDIO_SYSTEM_PROMPT,
      expect: {
        requiredTools: ["ui_audio_list_effects", "ui_audio_apply_effect"],
        ordering: [["ui_audio_list_effects", "ui_audio_apply_effect"]],
        noErrorResults: true,
        minToolCalls: 2,
        maxToolCalls: 6,
        finalState: [
          {
            name: "reverbApplied",
            detail: "no reverb was applied",
            test: (s) => s.effects.some((effect) => effect.effectId === "reverb")
          },
          {
            name: "mixAtHalf",
            detail: "the reverb mix is not 50%",
            test: (s) =>
              s.effects.some(
                (effect) =>
                  effect.effectId === "reverb" && effect.params.mix === 50
              )
          },
          {
            name: "wholeClip",
            detail: "the reverb covers only part of the clip",
            test: (s) =>
              s.effects.some(
                (effect) =>
                  effect.effectId === "reverb" &&
                  (effect.range === null ||
                    (effect.range.start <= 0.01 && effect.range.end >= 2.99))
              )
          }
        ]
      }
    }
  ];
