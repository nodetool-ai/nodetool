import { z } from "zod";
import { ANIMATION_PRESETS } from "@nodetool-ai/timeline";
import { FrontendToolRegistry } from "../frontendTools";
import { getTimelineAgentHandler } from "../../../components/timeline/timelineAgentBridge";

const animationRole = z.enum(["in", "out", "emphasis", "loop"]);

/**
 * Frontend tools that let the agent drive the live timeline / video editor —
 * cutting, arranging, generating, and tweaking clips like a real editor.
 *
 * They delegate to the handler the open {@link TimelineEditor} registers on the
 * {@link timelineAgentBridge}. When no editor is open, `getTimelineAgentHandler`
 * throws a descriptive error which the tool layer surfaces back to the agent.
 *
 * Conventions:
 *   - Times are in **milliseconds** on the sequence timeline.
 *   - Clips and tracks are addressed by id or by (case-insensitive) name; the
 *     literal `"selected"` resolves to the single selected clip.
 *   - Call `ui_timeline_get_state` first to discover the ids the other tools
 *     need.
 */

const targetParam = z
  .string()
  .describe(
    'Clip id, clip name (case-insensitive), or the literal "selected" for the currently-selected clip.'
  );

FrontendToolRegistry.register({
  name: "ui_timeline_get_state",
  description:
    "Read the open timeline editor: sequence resolution + fps + duration, the playhead position, the current selection, every track, and every clip with its timing, media type, generation binding (prompt/provider/model/status) and render params. Call this first to discover what's on the timeline and to get the ids/names other timeline tools need.",
  parameters: z.object({}),
  async execute() {
    const snapshot = getTimelineAgentHandler().getSnapshot();
    return { ok: true, ...snapshot };
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_add_track",
  description:
    "Add a new track to the timeline. `type` is one of video, audio, overlay, subtitle. Optionally provide a name.",
  parameters: z.object({
    type: z.enum(["video", "audio", "overlay", "subtitle"]),
    name: z.string().optional()
  }),
  async execute({ type, name }) {
    const track = getTimelineAgentHandler().addTrack(type, name);
    return { ok: true, track };
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_add_text_clip",
  description:
    "Add authored text to the timeline. It goes on an overlay track, creating one when needed, lasts 3000ms by default, and accepts the same motion presets as media clips.",
  parameters: z.object({
    text: z.string().trim().min(1),
    trackId: z.string().optional(),
    startMs: z.number().optional(),
    durationMs: z.number().optional(),
    style: z
      .object({
        fontFamily: z.string().optional(),
        fontSizePx: z.number().optional(),
        fontWeight: z.number().optional(),
        color: z.string().optional(),
        align: z.enum(["left", "center", "right"]).optional(),
        maxWidthFrac: z.number().optional()
      })
      .optional()
  }),
  async execute(args) {
    const clip = getTimelineAgentHandler().addTextClip(args);
    return { ok: true, clip };
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_add_shape_clip",
  description:
    "Add a rectangle, ellipse, or line on an overlay track. Omitted colors use a visible white fill for rectangles/ellipses or a visible white stroke for lines. Shapes are rasterized for preview/export and can use the standard motion presets.",
  parameters: z.object({
    shape: z.object({
      kind: z.enum(["rect", "ellipse", "line"]),
      fill: z.string().optional(),
      stroke: z.string().optional(),
      strokeWidthPx: z.number().optional(),
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      x2: z.number().optional(),
      y2: z.number().optional()
    }),
    trackId: z.string().optional(),
    startMs: z.number().optional(),
    durationMs: z.number().optional()
  }),
  async execute(args) {
    const clip = getTimelineAgentHandler().addShapeClip(args);
    return { ok: true, clip };
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_generate_clip",
  description:
    'Generate a new media clip from a text prompt and place it on the timeline. `kind` is text-to-video, text-to-image, or text-to-audio (TTS). Provide `provider` and `model` (discover valid ones with the model-search tool); when omitted the last-used model for that media kind is reused. `voice` is required for text-to-audio. Without a track the clip lands on a sensible track for its media kind; without `startMs` it is appended after the track\'s existing content. Generation starts immediately unless `autoGenerate` is false. For text-to-video, `aspectRatio` (e.g. "16:9") and `resolution` (e.g. "720p") and `durationMs` are honoured by video models.',
  parameters: z.object({
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
  async execute(args) {
    const result = await getTimelineAgentHandler().generateClip(args);
    return { ok: true, ...result };
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_split_clip",
  description:
    "Cut a clip in two at the given time (the razor tool). `atMs` is an absolute time on the timeline and must fall inside the clip; omit it to split at the current playhead. Returns the two resulting halves.",
  parameters: z.object({
    target: targetParam,
    atMs: z.number().optional()
  }),
  async execute({ target, atMs }) {
    const clips = getTimelineAgentHandler().splitClip(target, atMs);
    return { ok: true, clips };
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_trim_clip",
  description:
    "Trim a clip's length or its source in/out points. `durationMs` sets the on-timeline length; `inPointMs`/`outPointMs` set the trimmed source window (ms into the source media). Omit a field to leave it unchanged.",
  parameters: z.object({
    target: targetParam,
    durationMs: z.number().optional(),
    inPointMs: z.number().optional(),
    outPointMs: z.number().optional()
  }),
  async execute({ target, durationMs, inPointMs, outPointMs }) {
    const clip = getTimelineAgentHandler().trimClip(target, {
      durationMs,
      inPointMs,
      outPointMs
    });
    return { ok: true, clip };
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_move_clip",
  description:
    "Move a clip to a new absolute start time and/or onto a different track. `startMs` is the new start on the timeline (ms, clamped to >= 0); `trackId` reassigns the track. Omit a field to leave it unchanged.",
  parameters: z.object({
    target: targetParam,
    startMs: z.number().optional(),
    trackId: z.string().optional()
  }),
  async execute({ target, startMs, trackId }) {
    const clip = getTimelineAgentHandler().moveClip(target, {
      startMs,
      trackId
    });
    return { ok: true, clip };
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_delete_clip",
  description: "Remove a clip from the timeline.",
  parameters: z.object({ target: targetParam }),
  async execute({ target }) {
    const clip = getTimelineAgentHandler().deleteClip(target);
    return { ok: true, deleted: clip };
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_duplicate_clip",
  description:
    "Duplicate a clip. The copy is placed immediately after the source (add `gapMs` for a gap) and keeps its generation binding so you can tweak the copy for a variation.",
  parameters: z.object({
    target: targetParam,
    gapMs: z.number().optional()
  }),
  async execute({ target, gapMs }) {
    const clip = await getTimelineAgentHandler().duplicateClip(target, gapMs);
    return { ok: true, clip };
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_set_clip_params",
  description:
    "Change a clip's render/audio params: `name`, `opacity` (0..1), `speedMultiplier` (0.1..8), `volumeDb`, `fadeInMs`, `fadeOutMs`, `blendMode`, `borderRadius`, `hidden`, `muted`, `locked`, a text clip's `textStyle`, or a shape clip's `shapeStyle`. Omit a field to leave it unchanged.",
  parameters: z.object({
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
    textStyle: z
      .object({
        text: z.string(),
        fontFamily: z.string().optional(),
        fontSizePx: z.number(),
        fontWeight: z.number().optional(),
        color: z.string(),
        align: z.enum(["left", "center", "right"]).optional(),
        maxWidthFrac: z.number().optional()
      })
      .optional(),
    shapeStyle: z
      .object({
        kind: z.enum(["rect", "ellipse", "line"]),
        fill: z.string().optional(),
        stroke: z.string().optional(),
        strokeWidthPx: z.number().optional(),
        x: z.number().optional(),
        y: z.number().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
        x2: z.number().optional(),
        y2: z.number().optional()
      })
      .optional()
  }),
  async execute({ target, ...patch }) {
    const clip = getTimelineAgentHandler().setClipParams(target, patch);
    return { ok: true, clip };
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_set_clip_binding",
  description:
    "Edit a generated clip's generation binding — its `prompt`, `negativePrompt`, `provider`/`model`, TTS `voice`, dimensions, `aspectRatio`/`resolution`, `strength`, or `numInferenceSteps`. Set `regenerate` true to immediately re-run generation with the new settings. Only applies to generated clips.",
  parameters: z.object({
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
  async execute({ target, ...patch }) {
    const clip = await getTimelineAgentHandler().setClipBinding(target, patch);
    return { ok: true, clip };
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_animate_clip",
  description:
    'Attach motion-design animations to a clip — no keyframing, just named presets. Roles: `in` (entrance: fade, slide, pop, spin), `out` (exit: fade, slide, pop, spin), `emphasis` (mid-clip: pulse, shake, bounce), `loop` (continuous: kenBurns, float, breathe, rotate). Each animation: `role`, `preset`, optional `durationMs` (defaults per preset), `delayMs`, `easing`, and preset `params`. `mode` "replace" (default) swaps the clip\'s animations; "add" appends. Call ui_timeline_list_animation_presets for the full param list. Recommended loop: ui_timeline_get_state -> animate -> ui_timeline_get_clip_frames at the window boundaries -> adjust.',
  parameters: z.object({
    target: targetParam,
    mode: z.enum(["add", "replace"]).optional(),
    animations: z
      .array(
        z.object({
          role: animationRole,
          preset: z
            .string()
            .describe("Preset id, e.g. fade, slide, pop, kenBurns, float."),
          durationMs: z.number().positive().optional(),
          delayMs: z.number().nonnegative().optional(),
          easing: z.string().optional(),
          params: z
            .record(z.string(), z.union([z.number(), z.string(), z.boolean()]))
            .optional()
        })
      )
      .min(1)
  }),
  async execute({ target, mode, animations }) {
    const clip = getTimelineAgentHandler().setClipAnimations(
      target,
      animations,
      mode ?? "replace"
    );
    return { ok: true, clip };
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_clear_animations",
  description:
    "Remove motion-design animations from a clip. Pass `role` to clear only that role (in/out/emphasis/loop); omit it to clear all.",
  parameters: z.object({
    target: targetParam,
    role: animationRole.optional()
  }),
  async execute({ target, role }) {
    const clip = getTimelineAgentHandler().clearClipAnimations(target, role);
    return { ok: true, clip };
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_list_animation_presets",
  description:
    "List the motion-design animation presets: id, allowed roles, params (with defaults and ranges), default duration/easing, and a one-line description. Use this to discover the exact preset names and params for ui_timeline_animate_clip.",
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
    return { ok: true, presets };
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_get_clip_frames",
  description:
    "Inspect visual frames from a rendered video clip. Provide `target` and optional absolute timeline `timesMs`; otherwise the tool samples evenly across the clip. Returns JPEG data URLs plus timeline/source timestamps so you can see the clip content before splitting, trimming, or editing it.",
  parameters: z.object({
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
  async execute({ target, timesMs, count, width }) {
    const result = await getTimelineAgentHandler().getClipFrames(target, {
      timesMs,
      count,
      width
    });
    return { ok: true, ...result };
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_select_clip",
  description:
    "Select a clip in the timeline (driving the inspector). Pass null/empty to clear the selection.",
  parameters: z.object({
    target: targetParam.nullable().optional()
  }),
  async execute({ target }) {
    const clip = getTimelineAgentHandler().selectClip(target ?? null);
    return { ok: true, selected: clip };
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_seek",
  description:
    "Move the playhead to an absolute time (ms) on the timeline. Useful before splitting at the playhead.",
  parameters: z.object({ timeMs: z.number() }),
  async execute({ timeMs }) {
    const playheadMs = getTimelineAgentHandler().seek(timeMs);
    return { ok: true, playheadMs };
  }
});
