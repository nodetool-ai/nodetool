import { z } from "zod";
import {
  ANIMATED_PROPERTIES,
  ANIMATION_PRESETS,
  CUSTOM_ANIMATION_CONTRACT,
  STAGGER_UNITS
} from "@nodetool-ai/timeline";
import {
  addGroupParams,
  captionStyleParams,
  effectParams,
  maskParams,
  matteParams,
  partialTextStyleParams,
  setParentParams,
  shapeStyleParams,
  targetParam,
  textStyleParams,
  transitionParams
} from "@nodetool-ai/protocol/api-schemas/timeline-tool-params.js";
import { FrontendToolRegistry } from "../frontendTools";
import { getTimelineAgentHandler } from "../../../components/timeline/timelineAgentBridge";
import { docUrl } from "./resourceLinks";

const animationRole = z.enum(["in", "out", "emphasis", "loop"]);

/**
 * Frontend tools that let the agent drive the live timeline / video editor —
 * cutting, arranging, generating, and tweaking clips like a real editor.
 *
 * They delegate to the handler each open {@link TimelineEditor} registers under
 * its sequence id on the {@link timelineAgentBridge}. When no editor is open for
 * the requested id, `getTimelineAgentHandler` throws a descriptive error listing
 * the ids that are open, which the tool layer surfaces back to the agent.
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

FrontendToolRegistry.register({
  name: "ui_timeline_get_state",
  description:
    "Read the specified timeline sequence: resolution + fps + duration, the playhead position, the current selection, every track, and every clip with its timing, media type, generation binding (prompt/provider/model/status) and render params. Call this first to discover what's on the timeline and to get the ids/names other timeline tools need.",
  parameters: z.object({ timeline_id: timelineIdParam }),
  async execute({ timeline_id }) {
    const snapshot = getTimelineAgentHandler(timeline_id).getSnapshot();
    return { ok: true, ...snapshot };
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_add_track",
  description:
    "Add a new track to the specified timeline sequence. `type` is one of video, audio, overlay, subtitle. Optionally provide a name.",
  parameters: z.object({
    timeline_id: timelineIdParam,
    type: z.enum(["video", "audio", "overlay", "subtitle"]),
    name: z.string().optional()
  }),
  async execute({ timeline_id, type, name }) {
    const track = getTimelineAgentHandler(timeline_id).addTrack(type, name);
    return { ok: true, track, url: docUrl("timeline", timeline_id) };
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
    const clip = await getTimelineAgentHandler(timeline_id).addMediaClip(args);
    return {
      ok: true,
      clip,
      url: docUrl("timeline", timeline_id, { key: "clip", value: clip.id })
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_add_text_clip",
  description:
    "Add authored text to the specified timeline sequence. It goes on an overlay track, creating one when needed, lasts 3000ms by default, and accepts the same motion presets as media clips.",
  parameters: z.object({
    timeline_id: timelineIdParam,
    text: z.string().trim().min(1),
    trackId: z.string().optional(),
    startMs: z.number().optional(),
    durationMs: z.number().optional(),
    style: partialTextStyleParams.optional()
  }),
  async execute({ timeline_id, ...args }) {
    const clip = getTimelineAgentHandler(timeline_id).addTextClip(args);
    return {
      ok: true,
      clip,
      url: docUrl("timeline", timeline_id, { key: "clip", value: clip.id })
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_add_shape_clip",
  description:
    "Add a rectangle, ellipse, or line on an overlay track of the specified timeline sequence. Omitted colors use a visible white fill for rectangles/ellipses or a visible white stroke for lines. Shapes are rasterized for preview/export and can use the standard motion presets.",
  parameters: z.object({
    timeline_id: timelineIdParam,
    shape: shapeStyleParams,
    trackId: z.string().optional(),
    startMs: z.number().optional(),
    durationMs: z.number().optional()
  }),
  async execute({ timeline_id, ...args }) {
    const clip = getTimelineAgentHandler(timeline_id).addShapeClip(args);
    return {
      ok: true,
      clip,
      url: docUrl("timeline", timeline_id, { key: "clip", value: clip.id })
    };
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
    const clips = getTimelineAgentHandler(timeline_id).splitClip(target, atMs);
    return { ok: true, clips, url: docUrl("timeline", timeline_id) };
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
    const clip = getTimelineAgentHandler(timeline_id).trimClip(target, {
      durationMs,
      inPointMs,
      outPointMs
    });
    return {
      ok: true,
      clip,
      url: docUrl("timeline", timeline_id, { key: "clip", value: clip.id })
    };
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
    const clip = getTimelineAgentHandler(timeline_id).moveClip(target, {
      startMs,
      trackId
    });
    return {
      ok: true,
      clip,
      url: docUrl("timeline", timeline_id, { key: "clip", value: clip.id })
    };
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
    const clip = getTimelineAgentHandler(timeline_id).deleteClip(target);
    return { ok: true, deleted: clip, url: docUrl("timeline", timeline_id) };
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
    const clip = await getTimelineAgentHandler(timeline_id).duplicateClip(
      target,
      gapMs
    );
    return {
      ok: true,
      clip,
      url: docUrl("timeline", timeline_id, { key: "clip", value: clip.id })
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_set_clip_params",
  description:
    "Change a clip's render/audio params: `name`, `opacity` (0..1), `speedMultiplier` (0.1..8), `volumeDb`, `fadeInMs`, `fadeOutMs`, `blendMode`, `borderRadius`, `hidden`, `muted`, `locked`, a text clip's `textStyle`, a shape clip's `shapeStyle`, or a caption clip's `captionStyle`. Omit a field to leave it unchanged.",
  parameters: z.object({
    timeline_id: timelineIdParam,
    target: targetParam,
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
  }),
  async execute({ timeline_id, target, ...patch }) {
    const clip = getTimelineAgentHandler(timeline_id).setClipParams(
      target,
      patch
    );
    return {
      ok: true,
      clip,
      url: docUrl("timeline", timeline_id, { key: "clip", value: clip.id })
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_add_group",
  description:
    "Create a group clip: a clip with no media of its own whose transform, opacity and window every clip naming it inherits. Move the group and its children move with it; fade the group and they fade together; a child outside the group's window is not drawn. Children keep their own tracks, so what covers what is unchanged. Pass `children` to parent clips as the group is created, or use ui_timeline_set_parent afterwards.",
  parameters: addGroupParams.extend({ timeline_id: timelineIdParam }),
  async execute({ timeline_id, ...args }) {
    const result = getTimelineAgentHandler(timeline_id).addGroup(args);
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
  name: "ui_timeline_set_parent",
  description:
    "Parent a clip to a group so it inherits the group's transform, opacity and window, or release it with `parentId: null`. The parent must be a clip created with ui_timeline_add_group; a clip cannot parent itself or any group beneath it.",
  parameters: setParentParams.extend({ timeline_id: timelineIdParam }),
  async execute({ timeline_id, target, parentId }) {
    const clip = getTimelineAgentHandler(timeline_id).setParent(
      target,
      parentId
    );
    return {
      ok: true,
      clip,
      url: docUrl("timeline", timeline_id, { key: "clip", value: clip.id })
    };
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
    const clip = getTimelineAgentHandler(timeline_id).setTransition(
      target,
      transition
    );
    return {
      ok: true,
      clip,
      url: docUrl("timeline", timeline_id, { key: "clip", value: clip.id })
    };
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
    const clip = getTimelineAgentHandler(timeline_id).setMask(target, mask);
    return {
      ok: true,
      clip,
      url: docUrl("timeline", timeline_id, { key: "clip", value: clip.id })
    };
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
    const clip = getTimelineAgentHandler(timeline_id).setMatte(target, matte);
    return {
      ok: true,
      clip,
      url: docUrl("timeline", timeline_id, { key: "clip", value: clip.id })
    };
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
    const clip = getTimelineAgentHandler(timeline_id).setEffects(
      target,
      effects
    );
    return {
      ok: true,
      clip,
      url: docUrl("timeline", timeline_id, { key: "clip", value: clip.id })
    };
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
    const clip = await getTimelineAgentHandler(timeline_id).setClipBinding(
      target,
      patch
    );
    return {
      ok: true,
      clip,
      url: docUrl("timeline", timeline_id, { key: "clip", value: clip.id })
    };
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
    const clip = getTimelineAgentHandler(timeline_id).setClipAnimations(
      target,
      animations,
      mode ?? "replace"
    );
    return {
      ok: true,
      clip,
      url: docUrl("timeline", timeline_id, { key: "clip", value: clip.id })
    };
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
    const clip = getTimelineAgentHandler(timeline_id).clearClipAnimations(
      target,
      role
    );
    return {
      ok: true,
      clip,
      url: docUrl("timeline", timeline_id, { key: "clip", value: clip.id })
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_list_animation_presets",
  description:
    "List the motion-design animation presets: id, allowed roles, params (with defaults and ranges), default duration/easing, and a one-line description. Also returns the `custom` preset's contract and every animatable property with its fold, identity and range, for keyframed motion no preset covers. Use this to discover the exact preset names and params for ui_timeline_animate_clip.",
  parameters: z.object({}),
  async execute() {
    const presets = ANIMATION_PRESETS.map((p) => ({
      id: p.id,
      roles: p.roles,
      defaultDurationMs: p.defaultDurationMs,
      defaultEasing: p.defaultEasing,
      params: p.params,
      describe: p.describe
    }));
    return {
      ok: true,
      presets,
      custom: CUSTOM_ANIMATION_CONTRACT,
      properties: CUSTOM_ANIMATION_CONTRACT.properties
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_get_clip_frames",
  description:
    "Inspect visual frames from a rendered video clip. Provide `target` and optional absolute timeline `timesMs`; otherwise the tool samples evenly across the clip. Returns JPEG data URLs plus timeline/source timestamps so you can see the clip content before splitting, trimming, or editing it.",
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
    const clip = getTimelineAgentHandler(timeline_id).selectClip(
      target ?? null
    );
    return { ok: true, selected: clip };
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
    const playheadMs = getTimelineAgentHandler(timeline_id).seek(timeMs);
    return { ok: true, playheadMs };
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
    const marker = getTimelineAgentHandler(timeline_id).addMarker(opts);
    return { ok: true, marker, url: docUrl("timeline", timeline_id) };
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
    const deleted = getTimelineAgentHandler(timeline_id).deleteMarker(target);
    return { ok: true, deleted, url: docUrl("timeline", timeline_id) };
  }
});
