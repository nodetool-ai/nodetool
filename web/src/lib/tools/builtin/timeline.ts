import { z } from "zod";
import {
  ANIMATED_PROPERTIES,
  DEFAULT_BEAT_TOLERANCE_MS,
  STAGGER_UNITS
} from "@nodetool-ai/timeline";
import type { TimelineOpResult } from "@nodetool-ai/timeline/ops";
import {
  ADD_SHAPE_CLIP_DESCRIPTION,
  ADD_TEXT_CLIP_DESCRIPTION,
  ADD_TRACK_DESCRIPTION,
  DELETE_TRACK_DESCRIPTION,
  MOVE_TRACK_DESCRIPTION,
  deleteTrackShape,
  resolveDeleteTrackArgs,
  withTextClipRemedies,
  clipOpacityParam,
  moveTrackShape,
  resolveMoveTrackArgs,
  addGroupParams,
  captionStyleParams,
  effectParams,
  maskParams,
  matteParams,
  partialTextStyleParams,
  setParentParams,
  resolveShapeArg,
  setTimeRemapParams,
  shapeStyleParams,
  targetParam,
  textStyleParams,
  transitionParams
} from "@nodetool-ai/protocol/api-schemas/timeline-tool-params.js";
import { FrontendToolRegistry } from "../frontendTools";
import { getTimelineAgentHandler } from "../../../components/timeline/timelineAgentBridge";
import { docUrl } from "./resourceLinks";

/**
 * Frontend tools that let the agent drive the live timeline / video editor —
 * cutting, arranging, generating, and tweaking clips like a real editor.
 *
 * Every tool parses its own input and hands one op to the handler each open
 * {@link TimelineEditor} registers on the {@link timelineAgentBridge}; the op
 * semantics live in `@nodetool-ai/timeline/ops`, shared with the headless
 * bridge, so the two surfaces cannot drift. When no editor is open for the
 * requested id, `getTimelineAgentHandler` throws a descriptive error listing
 * the ids that are open.
 *
 * Conventions:
 *   - Every tool names its target sequence via `timeline_id` — there is no
 *     implicit "current" timeline.
 *   - Times are in **milliseconds** on the sequence timeline.
 *   - Clips and tracks are addressed by id or by (case-insensitive) name; the
 *     literal `"selected"` resolves to the single selected clip.
 *   - Call `ui_timeline_get_state` first to discover the ids the other tools
 *     need.
 */

const timelineIdParam = z
  .string()
  .describe(
    "Id of the target timeline sequence. The ids of the sequences currently open are listed in the ui_context block of the system prompt."
  );

/**
 * The `custom` preset's inputs: keyframes written out, or a body baked into
 * them. Values are checked by the engine's own gates
 * (`normalizeCustomCurves`, `resolveCustomMask`), so Zod only pins the shape.
 */
const customCurvesParam = z
  .array(
    z.object({
      property: z
        .string()
        .describe(`One of: ${ANIMATED_PROPERTIES.join(", ")}.`),
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

const animationRole = z.enum(["in", "out", "emphasis", "loop"]);

/**
 * An op result that names one clip, plus the resource link to it. Every
 * clip-returning tool reports the same way, so the agent gets one shape back
 * whichever edit it made.
 */
function clipResult(
  timelineId: string,
  result: TimelineOpResult
): TimelineOpResult & { url: string } {
  const clip = (result as { clip?: { id?: string } }).clip;
  return {
    ...result,
    url:
      typeof clip?.id === "string"
        ? docUrl("timeline", timelineId, { key: "clip", value: clip.id })
        : docUrl("timeline", timelineId)
  };
}

FrontendToolRegistry.register({
  name: "ui_timeline_get_state",
  description:
    "Read the specified timeline sequence: resolution + fps + duration, the playhead position, the current selection, every track, and every clip with its timing, media type, generation binding (prompt/provider/model/status) and render params. Call this first to discover what's on the timeline and to get the ids/names other timeline tools need.",
  parameters: z.object({ timeline_id: timelineIdParam }),
  async execute({ timeline_id }) {
    const result = await getTimelineAgentHandler(timeline_id).applyOp({
      op: "get_state"
    });
    return { ...result, sequenceId: timeline_id };
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_add_track",
  description: ADD_TRACK_DESCRIPTION,
  parameters: z.object({
    timeline_id: timelineIdParam,
    type: z.enum(["video", "audio", "overlay", "subtitle"]),
    name: z.string().optional()
  }),
  async execute({ timeline_id, type, name }) {
    const result = await getTimelineAgentHandler(timeline_id).applyOp({
      op: "add_track",
      type,
      name
    });
    return { ...result, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_move_track",
  description: MOVE_TRACK_DESCRIPTION,
  parameters: z
    .object({ timeline_id: timelineIdParam, ...moveTrackShape })
    .strict(),
  async execute({ timeline_id, ...rest }) {
    const { target, toIndex, before, after } = resolveMoveTrackArgs(rest);
    const result = await getTimelineAgentHandler(timeline_id).applyOp({
      op: "move_track",
      target,
      toIndex,
      before,
      after
    });
    return { ...result, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_delete_track",
  description: DELETE_TRACK_DESCRIPTION,
  parameters: z
    .object({ timeline_id: timelineIdParam, ...deleteTrackShape })
    .strict(),
  async execute({ timeline_id, ...rest }) {
    const { target, deleteClips } = resolveDeleteTrackArgs(rest);
    const result = await getTimelineAgentHandler(timeline_id).applyOp({
      op: "delete_track",
      target,
      deleteClips
    });
    return { ...result, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_add_media_clip",
  description:
    "Place an existing asset — a video, image, or audio file already in the library — on the specified timeline sequence. `asset` is an asset id or `asset://<id>.<ext>` URI. Without a track the clip lands on a track matching its media kind, creating one when needed; without `startMs` it is appended after that track's existing content, so calling this once per asset lays them end to end. Duration comes from the asset unless `durationMs` overrides it.",
  parameters: z.object({
    timeline_id: timelineIdParam,
    asset: z.string().trim().min(1),
    trackId: z.string().optional(),
    startMs: z.number().optional(),
    durationMs: z.number().optional(),
    name: z.string().optional()
  }),
  async execute({ timeline_id, ...args }) {
    return clipResult(
      timeline_id,
      await getTimelineAgentHandler(timeline_id).applyOp({
        op: "add_media_clip",
        ...args
      })
    );
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_add_text_clip",
  description: ADD_TEXT_CLIP_DESCRIPTION,
  parameters: withTextClipRemedies(
    z
      .object({
        timeline_id: timelineIdParam,
        text: z.string().trim().min(1),
        trackId: z.string().optional(),
        startMs: z.number().optional(),
        durationMs: z.number().optional(),
        opacity: clipOpacityParam,
        style: partialTextStyleParams.optional()
      })
      .merge(partialTextStyleParams)
      .strict()
  ),
  async execute({
    timeline_id,
    text,
    trackId,
    startMs,
    durationMs,
    opacity,
    style,
    ...loose
  }) {
    return clipResult(
      timeline_id,
      await getTimelineAgentHandler(timeline_id).applyOp({
        op: "add_text_clip",
        text,
        trackId,
        startMs,
        durationMs,
        opacity,
        // `style` wins over a top-level twin: a caller that sent both meant the
        // bag it named.
        style: { ...loose, ...(style ?? {}) }
      })
    );
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_add_shape_clip",
  description: ADD_SHAPE_CLIP_DESCRIPTION,
  parameters: z
    .object({
      timeline_id: timelineIdParam,
      shape: shapeStyleParams.optional(),
      shapeStyle: shapeStyleParams.optional(),
      trackId: z.string().optional(),
      startMs: z.number().optional(),
      durationMs: z.number().optional(),
      opacity: clipOpacityParam
    })
    .merge(shapeStyleParams.partial())
    .strict(),
  async execute({
    timeline_id,
    shape,
    shapeStyle,
    trackId,
    startMs,
    durationMs,
    opacity,
    ...loose
  }) {
    return clipResult(
      timeline_id,
      await getTimelineAgentHandler(timeline_id).applyOp({
        op: "add_shape_clip",
        shape: resolveShapeArg(shape, shapeStyle, loose),
        trackId,
        startMs,
        durationMs,
        opacity
      })
    );
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_generate_clip",
  description:
    'Generate a new media clip from a text prompt and place it on the specified timeline sequence. `kind` is text-to-video, text-to-image, or text-to-audio (TTS). Provide `provider` and `model` (discover valid ones with the model-search tool); when omitted the last-used model for that media kind is reused. `voice` is required for text-to-audio. Without a track the clip lands on a sensible track for its media kind; without `startMs` it is appended after the track\'s existing content. Generation starts immediately unless `autoGenerate` is false. For text-to-video, `aspectRatio` (e.g. "16:9") and `resolution` (e.g. "720p") and `durationMs` are honoured by video models.',
  parameters: z.object({
    timeline_id: timelineIdParam,
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
  }),
  async execute({ timeline_id, ...args }) {
    const result =
      await getTimelineAgentHandler(timeline_id).generateClip(args);
    return {
      ok: true,
      ...result,
      url: docUrl("timeline", timeline_id, {
        key: "clip",
        value: result.clip.id
      })
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_split_clip",
  description:
    "Cut a clip in two at the given time (the razor tool). `atMs` is an absolute time on the timeline and must fall inside the clip; omit it to split at the current playhead. Returns the two resulting halves.",
  parameters: z.object({
    timeline_id: timelineIdParam,
    target: targetParam,
    atMs: z.number().optional()
  }),
  async execute({ timeline_id, target, atMs }) {
    const result = await getTimelineAgentHandler(timeline_id).applyOp({
      op: "split_clip",
      target,
      atMs
    });
    return { ...result, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_trim_clip",
  description:
    "Trim a clip's length or its source in/out points. `durationMs` sets the on-timeline length; `inPointMs`/`outPointMs` set the trimmed source window (ms into the source media). Omit a field to leave it unchanged.",
  parameters: z.object({
    timeline_id: timelineIdParam,
    target: targetParam,
    durationMs: z.number().optional(),
    inPointMs: z.number().optional(),
    outPointMs: z.number().optional()
  }),
  async execute({ timeline_id, target, durationMs, inPointMs, outPointMs }) {
    return clipResult(
      timeline_id,
      await getTimelineAgentHandler(timeline_id).applyOp({
        op: "trim_clip",
        target,
        durationMs,
        inPointMs,
        outPointMs
      })
    );
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_move_clip",
  description:
    "Move a clip to a new absolute start time and/or onto a different track. `startMs` is the new start on the timeline (ms, clamped to >= 0); `trackId` reassigns the track. Omit a field to leave it unchanged.",
  parameters: z.object({
    timeline_id: timelineIdParam,
    target: targetParam,
    startMs: z.number().optional(),
    trackId: z.string().optional()
  }),
  async execute({ timeline_id, target, startMs, trackId }) {
    return clipResult(
      timeline_id,
      await getTimelineAgentHandler(timeline_id).applyOp({
        op: "move_clip",
        target,
        startMs,
        trackId
      })
    );
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_delete_clip",
  description: "Remove a clip from the specified timeline sequence.",
  parameters: z.object({
    timeline_id: timelineIdParam,
    target: targetParam
  }),
  async execute({ timeline_id, target }) {
    const result = await getTimelineAgentHandler(timeline_id).applyOp({
      op: "delete_clip",
      target
    });
    return { ...result, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_duplicate_clip",
  description:
    "Duplicate a clip. The copy is placed immediately after the source (add `gapMs` for a gap) and keeps its generation binding so you can tweak the copy for a variation.",
  parameters: z.object({
    timeline_id: timelineIdParam,
    target: targetParam,
    gapMs: z.number().optional()
  }),
  async execute({ timeline_id, target, gapMs }) {
    return clipResult(
      timeline_id,
      await getTimelineAgentHandler(timeline_id).applyOp({
        op: "duplicate_clip",
        target,
        gapMs
      })
    );
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_set_clip_params",
  description:
    "Change a clip's render/audio params: `name`, `opacity` (0..1), `speedMultiplier` (0.1..8), `volumeDb`, `fadeInMs`, `fadeOutMs`, `blendMode`, `borderRadius`, `hidden`, `muted`, `locked`, a text clip's `textStyle`, a shape clip's `shapeStyle`, or a caption clip's `captionStyle`. `fontSizePx` is shorthand for `textStyle.fontSizePx`. Timing is accepted too and applied as trim_clip/move_clip would: `durationMs`, `inPointMs`, `outPointMs`, `startMs`, `trackId`. A key this tool does not know is refused by name rather than ignored. Omit a field to leave it unchanged.",
  parameters: z
    .object({
      timeline_id: timelineIdParam,
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
      // A key the schema does not list is kept rather than stripped, so the op
      // can refuse it by name: silently dropping `startMs` looked like a
      // successful call that changed nothing.
    })
    .catchall(z.unknown()),
  async execute({ timeline_id, target, ...patch }) {
    return clipResult(
      timeline_id,
      await getTimelineAgentHandler(timeline_id).applyOp({
        op: "set_clip_params",
        target,
        patch
      })
    );
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_add_group",
  description:
    "Create a group clip: a clip with no media of its own whose transform, opacity and window every clip naming it inherits. Move the group and its children move with it; fade the group and they fade together; a child outside the group's window is not drawn. Children keep their own tracks, so what covers what is unchanged. Pass `children` to parent clips as the group is created, or use ui_timeline_set_parent afterwards.",
  parameters: addGroupParams.extend({ timeline_id: timelineIdParam }),
  async execute({ timeline_id, ...args }) {
    return clipResult(
      timeline_id,
      await getTimelineAgentHandler(timeline_id).applyOp({
        op: "add_group",
        ...args
      })
    );
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_set_parent",
  description:
    "Parent a clip to a group so it inherits the group's transform, opacity and window, or release it with `parentId: null`. The parent must be a clip created with ui_timeline_add_group; a clip cannot parent itself or any group beneath it.",
  parameters: setParentParams.extend({ timeline_id: timelineIdParam }),
  async execute({ timeline_id, target, parentId }) {
    return clipResult(
      timeline_id,
      await getTimelineAgentHandler(timeline_id).applyOp({
        op: "set_parent",
        target,
        parentId
      })
    );
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_set_transition",
  description:
    "Set the transition a clip opens with, or clear it with `transition: null`. A transition is between two clips: it plays over the head of `target` against whatever sits beneath it on the same track, so overlap the two clips by at least `durationMs` for both to be seen. Types: crossfade (dissolve), dipToColor (through a solid), wipe (feathered reveal), push (both clips travel), slide (only the incoming moves), zoom. With no transition set, overlapping clips still auto-dissolve across the overlap.",
  parameters: z.object({
    timeline_id: timelineIdParam,
    target: targetParam,
    transition: transitionParams.nullable()
  }),
  async execute({ timeline_id, target, transition }) {
    return clipResult(
      timeline_id,
      await getTimelineAgentHandler(timeline_id).applyOp({
        op: "set_transition",
        target,
        transition
      })
    );
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_set_mask",
  description:
    "Mask a clip to a rectangle, an ellipse or an SVG path, or clear it with `mask: null`. Coordinates are 0..1 in the clip's own space, so the mask turns and scales with the clip. `featherPx` softens the edge; `invert` keeps what the shape excludes instead.",
  parameters: z.object({
    timeline_id: timelineIdParam,
    target: targetParam,
    mask: maskParams.nullable()
  }),
  async execute({ timeline_id, target, mask }) {
    return clipResult(
      timeline_id,
      await getTimelineAgentHandler(timeline_id).applyOp({
        op: "set_mask",
        target,
        mask
      })
    );
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_set_matte",
  description:
    'Drive a clip\'s transparency from another clip — a track matte — or clear it with `matte: null`. The source clip stops drawing itself: its alpha (`mode: "alpha"`) or its brightness (`mode: "luma"`) becomes the target\'s transparency, so a white shape over black shows the target only where the shape is. Both clips are placed by their own transforms, so where the source sits on the frame is where the target shows through.',
  parameters: z.object({
    timeline_id: timelineIdParam,
    target: targetParam,
    matte: matteParams.nullable()
  }),
  async execute({ timeline_id, target, matte }) {
    return clipResult(
      timeline_id,
      await getTimelineAgentHandler(timeline_id).applyOp({
        op: "set_matte",
        target,
        matte
      })
    );
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_set_effects",
  description:
    "Replace a clip's effect chain, or clear it with `effects: []`. The list runs in order on the clip's own pixels, before it is placed on the frame. Types: color (brightness/contrast/saturation/hue/temperature/tint/shadows/highlights), blur, glow, dropShadow, vignette, sharpen, chromaKey, curves (control points, 0..1 on both axes), levels (in/out black and white plus gamma), liftGammaGain (a three-way grade, one number per channel). This replaces the whole chain — send every effect the clip should keep.",
  parameters: z.object({
    timeline_id: timelineIdParam,
    target: targetParam,
    effects: z
      .array(effectParams)
      .describe("The chain, in order. An empty list clears it.")
  }),
  async execute({ timeline_id, target, effects }) {
    return clipResult(
      timeline_id,
      await getTimelineAgentHandler(timeline_id).applyOp({
        op: "set_effects",
        target,
        effects
      })
    );
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_set_clip_binding",
  description:
    "Edit a generated clip's generation binding — its `prompt`, `negativePrompt`, `provider`/`model`, TTS `voice`, dimensions, `aspectRatio`/`resolution`, `strength`, or `numInferenceSteps`. Set `regenerate` true to immediately re-run generation with the new settings. Only applies to generated clips.",
  parameters: z.object({
    timeline_id: timelineIdParam,
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
  }),
  async execute({ timeline_id, target, ...patch }) {
    const { regenerate, ...binding } = patch;
    const handler = getTimelineAgentHandler(timeline_id);
    const result = await handler.applyOp({
      op: "set_clip_binding",
      target,
      ...binding
    });
    // Re-running generation is the browser's job, not the document's.
    if (regenerate) {
      await handler.regenerateClip((result as { clip: { id: string } }).clip.id);
    }
    return clipResult(timeline_id, result);
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_animate_clip",
  description:
    'Attach motion-design animations to a clip — no keyframing, just named presets. Roles: `in` (entrance: fade, slide, pop, spin, wipe, blur, colorFade), `out` (exit: fade, slide, pop, spin, wipe, blur, colorFade), `emphasis` (mid-clip: pulse, flash, shake, bounce, squash), `loop` (continuous: kenBurns, float, breathe, rotate, hueShift). Each animation: `role`, `preset`, optional `durationMs` (defaults per preset), `delayMs`, `easing`, and preset `params`. On text clips, add `stagger` for motion typography: each unit — `unit: "word"`, `"character"` (grapheme clusters; the space between words is timed and draws nothing) or `"line"` (wrapped lines) — runs the animation for `durationMs`, offset `stagger.offsetMs` from the previous one (`from`: start|end|center picks the leading unit) — e.g. a pop-in title whose words land one after another. For motion no preset covers, use `preset: "custom"` with exactly one of `curves` (keyframes you write: [{property, keyframes:[{t, value, easing?}]}], `t` running 0..1 over the window) or `code` (a JS body baked into curves once); add `mask` when a curve drives wipeProgress. `mode` "replace" (default) swaps the clip\'s animations; "add" appends. Call ui_timeline_list_animation_presets for the full param list and the animatable properties. Recommended loop: ui_timeline_get_state -> animate -> ui_timeline_get_clip_frames at the window boundaries -> adjust.',
  parameters: z.object({
    timeline_id: timelineIdParam,
    target: targetParam,
    mode: z.enum(["add", "replace"]).optional(),
    animations: z
      .array(
        z.object({
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
          curves: customCurvesParam,
          code: customCodeParam,
          mask: customMaskParam,
          stagger: z
            .object({
              unit: z.enum(STAGGER_UNITS),
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
        })
      )
      .min(1)
  }),
  async execute({ timeline_id, target, mode, animations }) {
    return clipResult(
      timeline_id,
      await getTimelineAgentHandler(timeline_id).applyOp({
        op: "animate_clip",
        target,
        mode: mode ?? "replace",
        animations
      })
    );
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_clear_animations",
  description:
    "Remove motion-design animations from a clip. Pass `role` to clear only that role (in/out/emphasis/loop); omit it to clear all.",
  parameters: z.object({
    timeline_id: timelineIdParam,
    target: targetParam,
    role: animationRole.optional()
  }),
  async execute({ timeline_id, target, role }) {
    return clipResult(
      timeline_id,
      await getTimelineAgentHandler(timeline_id).applyOp({
        op: "clear_animations",
        target,
        role
      })
    );
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_list_animation_presets",
  description:
    "List the motion-design animation presets: id, allowed roles, params (with defaults and ranges), default duration/easing, and a one-line description. Also returns the `custom` preset's contract and every animatable property with its fold, identity and range, for keyframed motion no preset covers. Use this to discover the exact preset names and params for ui_timeline_animate_clip.",
  parameters: z.object({ timeline_id: timelineIdParam }),
  async execute({ timeline_id }) {
    return getTimelineAgentHandler(timeline_id).applyOp({
      op: "list_animation_presets"
    });
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_get_clip_frames",
  description:
    "Inspect visual frames from ONE rendered video clip. `target` is required and names that clip — this tool never composites the timeline, so to see the finished frame (every track layered, titles and scrims drawn) call preview_timeline_frame instead. Give optional absolute timeline `timesMs`; otherwise the tool samples evenly across the clip. Returns JPEG data URLs plus timeline/source timestamps so you can see the clip content before splitting, trimming, or editing it.",
  parameters: z.object({
    timeline_id: timelineIdParam,
    target: targetParam,
    timesMs: z
      .array(z.number())
      .max(8)
      .optional()
      .describe(
        "Absolute timeline timestamps in milliseconds to inspect. Omit to sample evenly across the clip."
      ),
    count: z
      .number()
      .min(1)
      .max(8)
      .optional()
      .describe(
        "Number of evenly spaced frames to sample when timesMs is omitted. Default 3, max 8."
      ),
    width: z
      .number()
      .min(1)
      .max(1024)
      .optional()
      .describe("Output JPEG width in pixels. Default 512, max 1024.")
  }),
  async execute({ timeline_id, target, timesMs, count, width }) {
    const result = await getTimelineAgentHandler(timeline_id).getClipFrames(
      target,
      {
        timesMs,
        count,
        width
      }
    );
    return { ok: true, ...result };
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_select_clip",
  description:
    "Select a clip in the specified timeline sequence (driving the inspector). Pass null/empty to clear the selection.",
  parameters: z.object({
    timeline_id: timelineIdParam,
    target: targetParam.nullable().optional()
  }),
  async execute({ timeline_id, target }) {
    return getTimelineAgentHandler(timeline_id).applyOp({
      op: "select_clip",
      target: target ?? null
    });
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_seek",
  description:
    "Move the playhead to an absolute time (ms) in the specified timeline sequence. Useful before splitting at the playhead.",
  parameters: z.object({
    timeline_id: timelineIdParam,
    timeMs: z.number()
  }),
  async execute({ timeline_id, timeMs }) {
    return getTimelineAgentHandler(timeline_id).applyOp({
      op: "seek",
      timeMs
    });
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_add_marker",
  description:
    "Drop a marker at an absolute time on the specified timeline sequence, to flag a moment — a beat, a scene boundary, a note for the user. Markers do not render; they are annotations on the ruler.",
  parameters: z.object({
    timeline_id: timelineIdParam,
    timeMs: z
      .number()
      .describe("Absolute position on the timeline in ms. Must be >= 0."),
    label: z.string().optional().describe("Short label shown on the ruler."),
    color: z.string().optional().describe("CSS colour for the marker dot."),
    note: z.string().optional().describe("Longer note attached to the marker.")
  }),
  async execute({ timeline_id, ...opts }) {
    const result = await getTimelineAgentHandler(timeline_id).applyOp({
      op: "add_marker",
      ...opts
    });
    return { ...result, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_delete_marker",
  description:
    "Remove a marker from the specified timeline sequence by id or by its label (case-insensitive). Call ui_timeline_get_state to see the markers it carries.",
  parameters: z.object({
    timeline_id: timelineIdParam,
    target: z.string().describe("Marker id or label (case-insensitive).")
  }),
  async execute({ timeline_id, target }) {
    const result = await getTimelineAgentHandler(timeline_id).applyOp({
      op: "delete_marker",
      target
    });
    return { ...result, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_set_time_remap",
  description:
    "Retime a clip from a curve — ramps, freezes, speed changes — or clear it with `timeRemap: null` so it plays at its own rate. Each keyframe maps a position in the clip's window (`t`, 0..1) to a point in the source media (`sourceMs`); the curve must start at t 0 and end at t 1, ascending, with at least two keyframes. A remapped clip refuses splits and trims: clear the curve first.",
  parameters: setTimeRemapParams.extend({ timeline_id: timelineIdParam }),
  async execute({ timeline_id, target, timeRemap }) {
    return clipResult(
      timeline_id,
      await getTimelineAgentHandler(timeline_id).applyOp({
        op: "set_time_remap",
        target,
        timeRemap
      })
    );
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_set_markers_from_beats",
  description:
    "Lay a marker on every beat of a grid, so the cut has something to work against. The grid is either `onsets_ms` — detect_audio_events reports `onsets.times` in SECONDS, so multiply by 1000 — or `bpm` with `count` and an optional `offset_ms` for where beat one sits. Markers already on the sequence are kept, and a beat that already carries one is skipped, so re-running the same grid changes nothing.",
  parameters: z.object({
    timeline_id: timelineIdParam,
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
  }),
  async execute({ timeline_id, onsets_ms, bpm, offset_ms, count, label }) {
    const result = await getTimelineAgentHandler(timeline_id).applyOp({
      op: "set_markers_from_beats",
      onsets_ms,
      bpm,
      offset_ms,
      count,
      label
    });
    return { ...result, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_snap_to_beats",
  description:
    'Put clip boundaries on a beat grid. The grid is either `onsets_ms` — detect_audio_events reports `onsets.times` in SECONDS, so multiply by 1000 — or `bpm` with an optional `offset_ms`. `mode` picks the boundary, `action` picks how it gets there: `move` slides the whole clip and keeps its length, `trim` holds the opposite boundary and changes the length. A boundary further than `tolerance_ms` from every beat is left where it is and reported with the reason, so read the per-clip result rather than assuming everything moved.',
  parameters: z.object({
    timeline_id: timelineIdParam,
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
      .describe("Tempo. The grid is generated far enough to reach every target."),
    offset_ms: z
      .number()
      .optional()
      .describe("Where beat one sits, in ms. Default 0."),
    tolerance_ms: z
      .number()
      .optional()
      .describe(
        `How far a boundary may travel to reach a beat. Default ${DEFAULT_BEAT_TOLERANCE_MS}ms.`
      ),
    mode: z
      .enum(["start", "end", "both"])
      .optional()
      .describe('Which boundary lands on a beat. Default "start".'),
    action: z
      .enum(["move", "trim"])
      .optional()
      .describe('"move" slides the clip, "trim" changes its length. Default "move".')
  }),
  async execute({
    timeline_id,
    targets,
    onsets_ms,
    bpm,
    offset_ms,
    tolerance_ms,
    mode,
    action
  }) {
    const result = await getTimelineAgentHandler(timeline_id).applyOp({
      op: "snap_to_beats",
      targets,
      onsets_ms,
      bpm,
      offset_ms,
      tolerance_ms,
      mode,
      action
    });
    return { ...result, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_insert_composition",
  description:
    "Insert a saved composition — a group template with its children and its own params — onto the sequence at `startMs`. Name the template in `composition_id` and override any of its params in `params`. The clips land parented to a group clip, so the whole insert moves, fades and trims as one.",
  parameters: z.object({
    timeline_id: timelineIdParam,
    composition_id: z.string().trim().min(1),
    startMs: z.number(),
    trackId: z.string().optional(),
    params: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
      .optional()
  }),
  async execute({ timeline_id, composition_id, startMs, trackId, params }) {
    const result = await getTimelineAgentHandler(timeline_id).applyOp({
      op: "insert_composition",
      composition_id,
      startMs,
      trackId,
      params
    });
    return { ...result, url: docUrl("timeline", timeline_id) };
  }
});

/** Ops one `ui_timeline_edit` call may carry — the headless cap (D-batch). */
const MAX_TIMELINE_EDIT_OPS = 60;
const TIMELINE_TOOL_PREFIX = "ui_timeline_";

/** Op names `ui_timeline_edit` dispatches to, without the prefix. */
function timelineOpNames(): string[] {
  return FrontendToolRegistry.getManifest()
    .map((tool) => tool.name)
    .filter(
      (name) =>
        name.startsWith(TIMELINE_TOOL_PREFIX) && name !== "ui_timeline_edit"
    )
    .map((name) => name.slice(TIMELINE_TOOL_PREFIX.length))
    .sort();
}

FrontendToolRegistry.register({
  name: "ui_timeline_edit",
  description:
    "Apply several timeline edits in one call. Each op names any ui_timeline_* tool — with or without the `ui_timeline_` prefix — and carries that tool's own input; `timeline_id` is taken from this call, so ops need not repeat it. Ops run in order and a failing one does not stop the rest: read `results` for the per-op outcome. Call ui_timeline_get_state afterwards when you need the ids the edits created.",
  parameters: z.object({
    timeline_id: timelineIdParam,
    ops: z
      .array(
        z.object({
          tool: z
            .string()
            .describe(
              'A ui_timeline_* tool name, with or without the "ui_timeline_" prefix.'
            ),
          input: z
            .record(z.string(), z.unknown())
            .optional()
            .describe("That tool's own input, minus timeline_id.")
        })
      )
      .min(1)
      .describe(`Up to ${MAX_TIMELINE_EDIT_OPS} operations, applied in order.`)
  }),
  async execute({ timeline_id, ops }, ctx) {
    if (ops.length > MAX_TIMELINE_EDIT_OPS) {
      throw new Error(
        `ops holds ${ops.length} entries; at most ${MAX_TIMELINE_EDIT_OPS} per call.`
      );
    }
    const results: {
      tool: string;
      ok: boolean;
      result?: unknown;
      error?: string;
    }[] = [];
    let applied = 0;
    for (const [index, op] of ops.entries()) {
      const name = op.tool.startsWith(TIMELINE_TOOL_PREFIX)
        ? op.tool
        : `${TIMELINE_TOOL_PREFIX}${op.tool}`;
      // A batch inside a batch has no meaning and would recurse.
      if (name === "ui_timeline_edit" || !FrontendToolRegistry.has(name)) {
        results.push({
          tool: op.tool,
          ok: false,
          error: `No timeline operation named "${name.slice(
            TIMELINE_TOOL_PREFIX.length
          )}". Available: ${timelineOpNames().join(", ")}.`
        });
        continue;
      }
      try {
        const result = await FrontendToolRegistry.call(
          name,
          { ...op.input, timeline_id },
          `ui_timeline_edit-${index}-${Date.now()}`,
          { getState: ctx.getState }
        );
        applied += 1;
        results.push({ tool: name, ok: true, result });
      } catch (e) {
        results.push({
          tool: name,
          ok: false,
          error: e instanceof Error ? e.message : String(e)
        });
      }
    }
    const failed = results.length - applied;
    return {
      ok: failed === 0,
      applied,
      failed,
      results,
      url: docUrl("timeline", timeline_id)
    };
  }
});
