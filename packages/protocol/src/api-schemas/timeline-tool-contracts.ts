/**
 * The `ui_timeline_*` tool contracts — one declaration of each tool's name,
 * description and argument shape, read by both hosts that register them:
 * the browser registry (`web/src/lib/tools/builtin/timeline.ts`) and the
 * headless eval bridge (`packages/agents/src/evals/surfaces/timeline.ts`).
 *
 * They lived twice before, copied "verbatim" and then drifted: seven
 * descriptions had diverged, and `ui_timeline_set_clip_params` accepted
 * `startMs` headlessly while the browser copy stripped it silently — the same
 * agent call reported success and moved nothing. Nothing could catch it,
 * because `packages/agents` cannot import from `web/`.
 *
 * `ui_timeline_animate_clip` names the engine's stagger units, animatable
 * properties and beat tolerance, which live in `@nodetool-ai/timeline` — a
 * package that depends on this one. So the record is built by
 * {@link buildTimelineToolContracts} from a vocabulary each host passes in from
 * there, rather than duplicating those lists here where they would drift.
 *
 * A tool only one host can implement stays out of the record and goes in
 * {@link BROWSER_ONLY_TIMELINE_TOOL_NAMES} or
 * {@link HEADLESS_ONLY_TIMELINE_TOOL_NAMES}; each host's parity test refuses a
 * `ui_timeline_*` tool that is in neither.
 */

import { z } from "zod";
import {
  ADD_SHAPE_CLIP_DESCRIPTION,
  ADD_TEXT_CLIP_DESCRIPTION,
  ADD_TRACK_DESCRIPTION,
  DELETE_TRACK_DESCRIPTION,
  MOVE_TRACK_DESCRIPTION,
  SET_TEMPO_DESCRIPTION,
  SET_TRACK_INSTRUMENT_DESCRIPTION,
  addGroupParams,
  addMidiClipParams,
  captionStyleParams,
  clipOpacityParam,
  deleteTrackShape,
  effectParams,
  maskParams,
  matteParams,
  moveTrackShape,
  partialTextStyleParams,
  setNotesParams,
  setParentParams,
  setTempoParams,
  setTimeRemapParams,
  setTrackInstrumentParams,
  shapeStyleParams,
  targetParam,
  textStyleParams,
  transitionParams,
  withTextClipRemedies
} from "./timeline-tool-params.js";
import {
  strictParams,
  type UiToolArgs,
  type UiToolContract
} from "./ui-tool-contract.js";

const animationRole = z.enum(["in", "out", "emphasis", "loop"]);

/**
 * The `custom` preset's inputs: keyframes written out, or a body baked into
 * them. Values are checked by the engine's own gates
 * (`normalizeCustomCurves`, `resolveCustomMask`), so Zod only pins the shape —
 * a second, looser copy of the rules here would admit curves the compiler
 * refuses.
 */
/** What the engine (`@nodetool-ai/timeline`) names, and this package cannot import. */
export interface TimelineToolVocabulary {
  /** `STAGGER_UNITS` — the units a staggered text animation splits into. */
  staggerUnits: readonly [string, ...string[]];
  /** `ANIMATED_PROPERTIES` — what a custom curve may drive. */
  animatedProperties: readonly string[];
  /** `DEFAULT_BEAT_TOLERANCE_MS` — how far a boundary may travel to a beat. */
  beatToleranceMs: number;
}

const customCurvesParam = (animatedProperties: readonly string[]) =>
  z
    .array(
      z.object({
        property: z
          .string()
          .describe(`One of: ${animatedProperties.join(", ")}.`),
        keyframes: z
          .array(
            z.object({
              t: z.number().describe("0..1 across the animation's window."),
              value: z.number(),
              easing: z.string().optional()
            })
          )
          .min(1)
      })
    )
    .optional()
    .describe(
      'Keyframes for `preset: "custom"`. Exactly one of `curves` and `code`.'
    );

const customCodeParam = z
  .string()
  .optional()
  .describe(
    'JS body for `preset: "custom"`, baked into curves once, host-side. ' +
      "It returns `{curves}` or `{samples}` and reads its clip context off " +
      "`inputs`. Exactly one of `curves` and `code`."
  );

const customMaskParam = z
  .object({
    direction: z.enum(["left", "right", "up", "down"]),
    softness: z.number().min(0).max(1)
  })
  .optional()
  .describe("Required when a curve drives wipeProgress, ignored otherwise.");

const animationInput = (vocab: TimelineToolVocabulary) => {
  const curves = customCurvesParam(vocab.animatedProperties);
  return z.object({
    role: animationRole,
    preset: z
      .string()
      .describe(
        'Preset id, e.g. fade, slide, wipe, pop, kenBurns, float — or "custom" with `curves` or `code`.'
      ),
    durationMs: z.number().positive().optional(),
    delayMs: z.number().nonnegative().optional(),
    easing: z.string().optional(),
    params: z
      .record(z.string(), z.union([z.number(), z.string(), z.boolean()]))
      .optional(),
    curves,
    code: customCodeParam,
    mask: customMaskParam,
    custom: z
      .object({ curves, code: customCodeParam, mask: customMaskParam })
      .optional()
      .describe(
        'Same as `curves`/`code`/`mask` one level down: {preset: "custom", custom: {curves: [...]}} is accepted and lifted.'
      ),
    stagger: z
      .object({
        unit: z.enum(vocab.staggerUnits),
        offsetMs: z
          .number()
          .positive()
          .describe("Delay between successive units in ms."),
        from: z.enum(["start", "end", "center"]).optional()
      })
      .optional()
      .describe(
        "Per-unit stagger — text clips only. The animation runs once per word, grapheme cluster or wrapped line, each unit offset from the previous."
      )
  });
};

export type TimelineAnimationInput = z.infer<ReturnType<typeof animationInput>>;

/**
 * Lift a nested `custom: {curves|code|mask}` onto the animation itself. The
 * flat form is the contract, but the nested one is the obvious guess from
 * `preset: "custom"`, and it used to be stripped by the schema and then
 * rejected as an animation with neither curves nor code.
 */
export function liftCustomAnimation<
  T extends {
    curves?: unknown;
    code?: string;
    mask?: unknown;
    custom?: { curves?: unknown; code?: string; mask?: unknown };
  }
>(input: T): T {
  if (!input.custom) return input;
  const { custom, ...rest } = input;
  return {
    ...rest,
    curves: input.curves ?? custom.curves,
    code: input.code ?? custom.code,
    mask: input.mask ?? custom.mask
  } as T;
}

/** Params `set_clip_params` reads. A key outside this list is refused by name. */
export const CLIP_PARAM_KEYS = [
  "name",
  "startMs",
  "trackId",
  "durationMs",
  "inPointMs",
  "outPointMs",
  "opacity",
  "speedMultiplier",
  "volumeDb",
  "fadeInMs",
  "fadeOutMs",
  "blendMode",
  "borderRadius",
  "hidden",
  "muted",
  "locked",
  "fontSizePx",
  "textStyle",
  "shapeStyle",
  "captionStyle"
];

/** Keys that belong to another op, named so the caller can go there. */
const CLIP_PARAM_ELSEWHERE: Record<string, string> = {
  animations: "animate_clip",
  transition: "set_transition",
  parentId: "set_parent",
  mask: "set_mask",
  effects: "set_effects",
  timeRemap: "set_time_remap"
};

/**
 * Timing and geometry are their own ops, and a key this tool does not read used
 * to be stripped by the schema — a call that reported success and changed
 * nothing. Name the op that does the job instead.
 */
export function rejectUnknownClipParams(patch: Record<string, unknown>): void {
  for (const key of Object.keys(patch)) {
    if (CLIP_PARAM_KEYS.includes(key)) continue;
    const elsewhere = CLIP_PARAM_ELSEWHERE[key];
    if (elsewhere) {
      throw new Error(
        `set_clip_params does not change \`${key}\`; use ${elsewhere}.`
      );
    }
    throw new Error(
      `set_clip_params has no \`${key}\` param. It takes: ${CLIP_PARAM_KEYS.join(", ")}.`
    );
  }
}

function makeTimelineToolContracts(vocab: TimelineToolVocabulary) {
  return {
    ui_timeline_get_state: {
      description:
        "Read the specified timeline sequence: resolution + fps + duration, the playhead position, the current selection, every track, and every clip with its timing, media type, generation binding (prompt/provider/model/status) and render params. Call this first to discover what's on the timeline and to get the ids/names other timeline tools need.",
      shape: {}
    },

    ui_timeline_add_track: {
      description: ADD_TRACK_DESCRIPTION,
      shape: {
        type: z.enum(["video", "audio", "overlay", "subtitle", "midi"]),
        name: z.string().optional()
      }
    },

    ui_timeline_move_track: {
      description: MOVE_TRACK_DESCRIPTION,
      shape: moveTrackShape,
      finalize: strictParams
    },

    ui_timeline_delete_track: {
      description: DELETE_TRACK_DESCRIPTION,
      shape: deleteTrackShape,
      finalize: strictParams
    },

    ui_timeline_add_media_clip: {
      description:
        "Place an existing asset — a video, image, or audio file already in the library — on the specified timeline sequence. `asset` is an asset id or `asset://<id>.<ext>` URI (list_assets returns both). Without a track the clip lands on a track matching its media kind, creating one when needed; without `startMs` it is appended after that track's existing content, so calling this once per asset lays them end to end. Duration comes from the asset unless `durationMs` overrides it.",
      shape: {
        asset: z.string().trim().min(1),
        trackId: z.string().optional(),
        startMs: z.number().optional(),
        durationMs: z.number().optional(),
        name: z.string().optional()
      }
    },

    ui_timeline_add_text_clip: {
      description: ADD_TEXT_CLIP_DESCRIPTION,
      shape: {
        text: z.string().trim().min(1),
        trackId: z.string().optional(),
        startMs: z.number().optional(),
        durationMs: z.number().optional(),
        opacity: clipOpacityParam,
        style: partialTextStyleParams.optional(),
        ...partialTextStyleParams.shape
      },
      // The remedies attach to the schema the host validates against, so they
      // are registered after the host has added its own fields.
      finalize: (schema: z.ZodObject<z.ZodRawShape>) =>
        withTextClipRemedies(schema.strict())
    },

    ui_timeline_add_shape_clip: {
      description: ADD_SHAPE_CLIP_DESCRIPTION,
      shape: {
        shape: shapeStyleParams.optional(),
        shapeStyle: shapeStyleParams.optional(),
        trackId: z.string().optional(),
        startMs: z.number().optional(),
        durationMs: z.number().optional(),
        opacity: clipOpacityParam,
        ...shapeStyleParams.partial().shape
      },
      finalize: strictParams
    },

    ui_timeline_generate_clip: {
      description:
        'Generate a new media clip from a text prompt and place it on the specified timeline sequence. `kind` is text-to-video, text-to-image, or text-to-audio (TTS). Provide `provider` and `model` (discover valid ones with the model-search tool); when omitted the last-used model for that media kind is reused. `voice` is required for text-to-audio. Without a track the clip lands on a sensible track for its media kind; without `startMs` it is appended after the track\'s existing content. Generation starts immediately unless `autoGenerate` is false. For text-to-video, `aspectRatio` (e.g. "16:9") and `resolution` (e.g. "720p") and `durationMs` are honoured by video models.',
      shape: {
        kind: z.enum(["text-to-video", "text-to-image", "text-to-audio"]),
        prompt: z.string(),
        trackId: z.string().optional(),
        startMs: z.number().optional(),
        durationMs: z.number().optional(),
        provider: z.string().optional(),
        model: z.string().optional(),
        voice: z.string().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
        aspectRatio: z.string().optional(),
        resolution: z.string().optional(),
        autoGenerate: z.boolean().optional()
      }
    },

    ui_timeline_split_clip: {
      description:
        "Cut a clip in two at the given time (the razor tool). `atMs` is an absolute time on the timeline and must fall inside the clip; omit it to split at the current playhead. Returns the two resulting halves.",
      shape: {
        target: targetParam,
        atMs: z.number().optional()
      }
    },

    ui_timeline_trim_clip: {
      description:
        "Trim a clip's length or its source in/out points. `durationMs` sets the on-timeline length; `inPointMs`/`outPointMs` set the trimmed source window (ms into the source media). Omit a field to leave it unchanged.",
      shape: {
        target: targetParam,
        durationMs: z.number().optional(),
        inPointMs: z.number().optional(),
        outPointMs: z.number().optional()
      }
    },

    ui_timeline_move_clip: {
      description:
        "Move a clip to a new absolute start time and/or onto a different track. `startMs` is the new start on the timeline (ms, clamped to >= 0); `trackId` reassigns the track. Omit a field to leave it unchanged.",
      shape: {
        target: targetParam,
        startMs: z.number().optional(),
        trackId: z.string().optional()
      }
    },

    ui_timeline_delete_clip: {
      description: "Remove a clip from the specified timeline sequence.",
      shape: { target: targetParam }
    },

    ui_timeline_duplicate_clip: {
      description:
        "Duplicate a clip. The copy is placed immediately after the source (add `gapMs` for a gap) and keeps its generation binding so you can tweak the copy for a variation.",
      shape: {
        target: targetParam,
        gapMs: z.number().optional()
      }
    },

    ui_timeline_set_clip_params: {
      description:
        "Change a clip's render/audio params: `name`, `opacity` (0..1), `speedMultiplier` (0.1..8), `volumeDb`, `fadeInMs`, `fadeOutMs`, `blendMode`, `borderRadius`, `hidden`, `muted`, `locked`, a text clip's `textStyle`, a shape clip's `shapeStyle`, or a caption clip's `captionStyle`. `fontSizePx` is shorthand for `textStyle.fontSizePx`. Timing is accepted too and applied as trim_clip/move_clip would: `durationMs`, `inPointMs`, `outPointMs`, `startMs`, `trackId`. A key this tool does not know is refused by name rather than ignored. Omit a field to leave it unchanged.",
      shape: {
        target: targetParam,
        startMs: z.number().optional(),
        trackId: z.string().optional(),
        durationMs: z.number().optional(),
        inPointMs: z.number().optional(),
        outPointMs: z.number().optional(),
        fontSizePx: z.number().optional(),
        name: z.string().optional(),
        opacity: z.number().optional(),
        speedMultiplier: z.number().optional(),
        volumeDb: z.number().optional(),
        fadeInMs: z.number().optional(),
        fadeOutMs: z.number().optional(),
        blendMode: z.string().optional(),
        borderRadius: z.number().optional(),
        hidden: z.boolean().optional(),
        muted: z.boolean().optional(),
        locked: z.boolean().optional(),
        textStyle: textStyleParams.optional(),
        shapeStyle: shapeStyleParams.optional(),
        captionStyle: captionStyleParams.optional()
      },
      // A key the schema does not list is kept rather than stripped, so
      // `rejectUnknownClipParams` can refuse it by name: silently dropping
      // `startMs` looked like a successful call that changed nothing.
      finalize: (schema: z.ZodObject<z.ZodRawShape>) =>
        schema.catchall(z.unknown())
    },

    ui_timeline_add_group: {
      description:
        "Create a group clip: a clip with no media of its own whose transform, opacity and window every clip naming it inherits. Move the group and its children move with it; fade the group and they fade together; a child outside the group's window is not drawn. Children keep their own tracks, so what covers what is unchanged. Pass `children` to parent clips as the group is created, or use ui_timeline_set_parent afterwards.",
      shape: addGroupParams.shape
    },

    ui_timeline_set_parent: {
      description:
        "Parent a clip to a group so it inherits the group's transform, opacity and window, or release it with `parentId: null`. The parent must be a clip created with ui_timeline_add_group; a clip cannot parent itself or any group beneath it.",
      shape: setParentParams.shape
    },

    ui_timeline_set_transition: {
      description:
        "Set the transition a clip opens with, or clear it with `transition: null`. A transition is between two clips: it plays over the head of `target` against whatever sits beneath it on the same track, so overlap the two clips by at least `durationMs` for both to be seen. Types: crossfade (dissolve), dipToColor (through a solid), wipe (feathered reveal), push (both clips travel), slide (only the incoming moves), zoom. With no transition set, overlapping clips still auto-dissolve across the overlap.",
      shape: {
        target: targetParam,
        transition: transitionParams.nullable()
      }
    },

    ui_timeline_set_mask: {
      description:
        "Mask a clip to a rectangle, an ellipse or an SVG path, or clear it with `mask: null`. Coordinates are 0..1 in the clip's own space, so the mask turns and scales with the clip. `featherPx` softens the edge; `invert` keeps what the shape excludes instead.",
      shape: {
        target: targetParam,
        mask: maskParams.nullable()
      }
    },

    ui_timeline_set_matte: {
      description:
        'Drive a clip\'s transparency from another clip — a track matte — or clear it with `matte: null`. The source clip stops drawing itself: its alpha (`mode: "alpha"`) or its brightness (`mode: "luma"`) becomes the target\'s transparency, so a white shape over black shows the target only where the shape is. Both clips are placed by their own transforms, so where the source sits on the frame is where the target shows through.',
      shape: {
        target: targetParam,
        matte: matteParams.nullable()
      }
    },

    ui_timeline_set_time_remap: {
      description:
        "Retime a clip from a curve — ramps, freezes, speed changes — or clear it with `timeRemap: null` so it plays at its own rate. Each keyframe says where in the source media (`sourceMs`) the clip sits at position `t`, normalized 0..1 over the clip's own window — so the list must start at 0, end at 1, ascend in `t`, and hold at least two keyframes. A `sourceMs` that descends is reverse playback, a flat pair is a freeze, and a steeper segment plays faster. A remap replaces the clip's rate entirely, and split and trim refuse a remapped clip: clear the curve first.",
      shape: setTimeRemapParams.shape
    },

    ui_timeline_set_effects: {
      description:
        "Replace a clip's effect chain, or clear it with `effects: []`. The list runs in order on the clip's own pixels, before it is placed on the frame. Types: color (brightness/contrast/saturation/hue/temperature/tint/shadows/highlights), blur, glow, dropShadow, vignette, sharpen, chromaKey, curves (control points, 0..1 on both axes), levels (in/out black and white plus gamma), liftGammaGain (a three-way grade, one number per channel). This replaces the whole chain — send every effect the clip should keep.",
      shape: {
        target: targetParam,
        effects: z
          .array(effectParams)
          .describe("The chain, in order. An empty list clears it.")
      }
    },

    ui_timeline_set_clip_binding: {
      description:
        "Edit a generated clip's generation binding — its `prompt`, `negativePrompt`, `provider`/`model`, TTS `voice`, dimensions, `aspectRatio`/`resolution`, `strength`, or `numInferenceSteps`. Set `regenerate` true to immediately re-run generation with the new settings. Only applies to generated clips.",
      shape: {
        target: targetParam,
        prompt: z.string().optional(),
        negativePrompt: z.string().optional(),
        provider: z.string().optional(),
        model: z.string().optional(),
        voice: z.string().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
        aspectRatio: z.string().optional(),
        resolution: z.string().optional(),
        strength: z.number().optional(),
        numInferenceSteps: z.number().optional(),
        regenerate: z.boolean().optional()
      }
    },

    ui_timeline_animate_clip: {
      description:
        'Attach motion-design animations to a clip — no keyframing, just named presets. Roles: `in` (entrance: fade, slide, pop, spin, wipe, blur, colorFade), `out` (exit: fade, slide, pop, spin, wipe, blur, colorFade), `emphasis` (mid-clip: pulse, flash, shake, bounce, squash), `loop` (continuous: kenBurns, float, breathe, rotate, hueShift). Each animation: `role`, `preset`, optional `durationMs` (defaults per preset), `delayMs`, `easing`, and preset `params`. On text clips, add `stagger` for motion typography: each unit — `unit: "word"`, `"character"` (grapheme clusters; the space between words is timed and draws nothing) or `"line"` (wrapped lines) — runs the animation for `durationMs`, offset `stagger.offsetMs` from the previous one (`from`: start|end|center picks the leading unit) — e.g. a pop-in title whose words land one after another. For motion no preset covers, use `preset: "custom"` with exactly one of `curves` (keyframes you write: [{property, keyframes:[{t, value, easing?}]}], `t` running 0..1 over the window) or `code` (a JS body baked into curves once); add `mask` when a curve drives wipeProgress. `mode` "replace" (default) swaps the clip\'s animations; "add" appends. Call ui_timeline_list_animation_presets for the full param list and the animatable properties. Recommended loop: ui_timeline_get_state -> animate -> look at the frames at the window boundaries -> adjust.',
      shape: {
        target: targetParam,
        mode: z.enum(["add", "replace"]).optional(),
        animations: z.array(animationInput(vocab)).min(1)
      }
    },

    ui_timeline_clear_animations: {
      description:
        "Remove motion-design animations from a clip. Pass `role` to clear only that role (in/out/emphasis/loop); omit it to clear all.",
      shape: {
        target: targetParam,
        role: animationRole.optional()
      }
    },

    ui_timeline_list_animation_presets: {
      description:
        "List the motion-design animation presets: id, allowed roles, params (with defaults and ranges), default duration/easing, and a one-line description. Also returns the `custom` preset's contract and every animatable property with its fold, identity and range, for keyframed motion no preset covers. Use this to discover the exact preset names and params for ui_timeline_animate_clip.",
      shape: {}
    },

    ui_timeline_select_clip: {
      description:
        "Select a clip in the specified timeline sequence (driving the inspector). Pass null/empty to clear the selection.",
      shape: { target: targetParam.nullable().optional() }
    },

    ui_timeline_seek: {
      description:
        "Move the playhead to an absolute time (ms) in the specified timeline sequence. Useful before splitting at the playhead.",
      shape: { timeMs: z.number() }
    },

    ui_timeline_add_marker: {
      description:
        "Drop a marker at an absolute time on the specified timeline sequence, to flag a moment — a beat, a scene boundary, a note for the user. Markers do not render; they are annotations on the ruler.",
      shape: {
        timeMs: z
          .number()
          .describe("Absolute position on the timeline in ms. Must be >= 0."),
        label: z.string().optional().describe("Short label shown on the ruler."),
        color: z.string().optional().describe("CSS colour for the marker dot."),
        note: z
          .string()
          .optional()
          .describe("Longer note attached to the marker.")
      }
    },

    ui_timeline_delete_marker: {
      description:
        "Remove a marker from the specified timeline sequence by id or by its label (case-insensitive). Call ui_timeline_get_state to see the markers it carries.",
      shape: {
        target: z.string().describe("Marker id or label (case-insensitive).")
      }
    },

    ui_timeline_set_markers_from_beats: {
      description:
        "Lay a marker on every beat of a grid, so the cut has something to work against. The grid is either `onsets_ms` — detect_audio_events reports `onsets.times` in SECONDS, so multiply by 1000 — or `bpm` with `count` and an optional `offset_ms` for where beat one sits. Markers already on the sequence are kept, and a beat that already carries one is skipped, so re-running the same grid changes nothing.",
      shape: {
        onsets_ms: z
          .array(z.number())
          .optional()
          .describe("Absolute beat times in ms. Exactly one of this and `bpm`."),
        bpm: z.number().optional().describe("Tempo. Needs `count`."),
        offset_ms: z
          .number()
          .optional()
          .describe("Where beat one sits, in ms. Default 0."),
        count: z.number().optional().describe("Beats to lay down, with `bpm`."),
        label: z
          .string()
          .optional()
          .describe(
            'Label stem; each marker is numbered from 1 ("Beat 1", "Beat 2", …). Default "Beat".'
          )
      }
    },

    ui_timeline_snap_to_beats: {
      description:
        "Put clip boundaries on a beat grid. The grid is either `onsets_ms` — detect_audio_events reports `onsets.times` in SECONDS, so multiply by 1000 — or `bpm` with an optional `offset_ms`. `mode` picks the boundary, `action` picks how it gets there: `move` slides the whole clip and keeps its length, `trim` holds the opposite boundary and changes the length. A boundary further than `tolerance_ms` from every beat is left where it is and reported with the reason, so read the per-clip result rather than assuming everything moved.",
      shape: {
        targets: z
          .union([z.array(z.string()), z.literal("all")])
          .optional()
          .describe(
            'Clip ids or names, or "all". Default: every clip on the sequence.'
          ),
        onsets_ms: z
          .array(z.number())
          .optional()
          .describe("Absolute beat times in ms. Exactly one of this and `bpm`."),
        bpm: z
          .number()
          .optional()
          .describe(
            "Tempo. The grid is generated far enough to reach every target."
          ),
        offset_ms: z
          .number()
          .optional()
          .describe("Where beat one sits, in ms. Default 0."),
        tolerance_ms: z
          .number()
          .optional()
          .describe(
            `How far a boundary may travel to reach a beat. Default ${vocab.beatToleranceMs}ms.`
          ),
        mode: z
          .enum(["start", "end", "both"])
          .optional()
          .describe('Which boundary lands on a beat. Default "start".'),
        action: z
          .enum(["move", "trim"])
          .optional()
          .describe(
            '"move" slides the clip, "trim" changes its length. Default "move".'
          )
      }
    }
,

    ui_timeline_add_midi_clip: {
      description:
        "Place a midi clip — a phrase played by the track's synth — on a midi track. The notes ride inside the clip in ticks from its content start (960 ticks = one quarter note, read against the document tempo), so trimming the clip hides notes rather than deleting them. `duration_ms` is the window: a note running past its end is gated there. Set the voice with ui_timeline_set_track_instrument and the tempo with ui_timeline_set_tempo.",
      shape: addMidiClipParams.shape
    },

    ui_timeline_set_notes: {
      description:
        "Replace a midi clip's notes. This is the whole list, not a merge — send every note the clip should keep, each with `pitch`, `start_tick` and `duration_tick` (960 ticks = one quarter note, counted from the clip's content start). Pass a note's `id` to keep the one it already has.",
      shape: setNotesParams.shape
    },

    ui_timeline_set_tempo: {
      description: SET_TEMPO_DESCRIPTION,
      shape: setTempoParams.shape
    },

    ui_timeline_set_track_instrument: {
      description: SET_TRACK_INSTRUMENT_DESCRIPTION,
      shape: setTrackInstrumentParams.shape
    }
  } satisfies Record<string, UiToolContract>;
}


export type TimelineToolContracts = ReturnType<typeof makeTimelineToolContracts>;

export type TimelineToolName = keyof TimelineToolContracts;

/** What one shared tool's handler receives once its arguments are parsed. */
export type TimelineToolArgs<K extends TimelineToolName> = UiToolArgs<
  TimelineToolContracts[K]
>;

const built = new Map<string, TimelineToolContracts>();

/**
 * The shared contracts, built once per vocabulary. Both hosts pass the same
 * lists straight out of `@nodetool-ai/timeline`, so both get the same record.
 */
export function buildTimelineToolContracts(
  vocab: TimelineToolVocabulary
): TimelineToolContracts {
  const key = [
    vocab.staggerUnits.join(","),
    vocab.animatedProperties.join(","),
    vocab.beatToleranceMs
  ].join("|");
  const cached = built.get(key);
  if (cached) return cached;
  const contracts = makeTimelineToolContracts(vocab);
  built.set(key, contracts);
  return contracts;
}

/**
 * Tools only the browser registers.
 *
 * `ui_timeline_get_clip_frames` samples pixels out of a rendered video clip,
 * which the headless surface has no rasterizer for. `ui_timeline_edit` batches
 * calls to the other tools through the browser registry, and the headless
 * bridge's `edit_timeline` already does that job by walking its own tool list.
 */
export const BROWSER_ONLY_TIMELINE_TOOL_NAMES = [
  "ui_timeline_get_clip_frames",
  "ui_timeline_edit"
] as const;

/**
 * Tools only the headless bridge registers. `ui_timeline_insert_composition`
 * reads a stored composition library the browser editor does not expose to the
 * agent.
 */
export const HEADLESS_ONLY_TIMELINE_TOOL_NAMES = [
  "ui_timeline_insert_composition"
] as const;
