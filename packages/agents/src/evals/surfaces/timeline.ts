/**
 * Headless bridge for the timeline / video editor tool-loop eval.
 *
 * The real frontend tools (`web/src/lib/tools/builtin/timeline.ts`) delegate to
 * a `TimelineAgentHandler` the live `TimelineEditor` registers per open
 * sequence on `timelineAgentBridge` — it mutates Zustand document/UI/playback
 * stores and (for `ui_timeline_get_clip_frames`) samples rendered video
 * frames. None of that can run under Node. This bridge reimplements the
 * *effects* of the non-rendering tools against a plain in-memory sequence
 * (tracks + clips from `@nodetool-ai/timeline`), so a model can drive the same
 * `ui_timeline_*` tool surface headlessly.
 *
 * What it does NOT fork is the tool *contract*: names, descriptions, and Zod
 * parameter shapes are copied verbatim from the builtin file (minus the
 * `timeline_id` parameter — this bridge holds a single implicit sequence, so
 * there is nothing to disambiguate). `ui_timeline_get_clip_frames` is
 * intentionally excluded: it requires real rendered video frames and has no
 * meaningful headless equivalent.
 *
 * Real cut/preset logic is reused from the pure `@nodetool-ai/timeline`
 * package (`splitClip`, `ANIMATION_PRESETS`, `makeClip`/`makeTrack`) rather
 * than reimplemented, so this bridge exercises the same behavior the live
 * editor does.
 */

import { z } from "zod";
import { parseWithTypeCoercion } from "@nodetool-ai/runtime";
import {
  splitClip,
  ANIMATION_PRESETS,
  makeClip,
  makeTrack,
  DEFAULT_TEXT_CLIP_DURATION_MS,
  DEFAULT_TEXT_CLIP_COLOR,
  DEFAULT_TEXT_CLIP_FONT_SIZE_PX,
  DEFAULT_SHAPE_FILL_COLOR,
  DEFAULT_SHAPE_STROKE_COLOR,
  DEFAULT_SHAPE_STROKE_WIDTH_PX,
  type TimelineClip,
  type TimelineTrack,
  type ClipAnimation
} from "@nodetool-ai/timeline";
import type { HeadlessTool } from "../tool-loop-bridge.js";
import type {
  HeadlessSurfaceBridge,
  ToolLoopEvalCase,
  ToolLoopStatePredicate
} from "../tool-loop-eval.js";

const animationRole = z.enum(["in", "out", "emphasis", "loop"]);

const targetParam = z
  .string()
  .describe(
    'Clip id, clip name (case-insensitive), or the literal "selected" for the currently-selected clip.'
  );

const textStyleParams = z.object({
  fontFamily: z.string().optional(),
  fontSizePx: z.number().optional(),
  fontWeight: z.number().optional(),
  color: z.string().optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  maxWidthFrac: z.number().optional()
});

const shapeStyleParams = z.object({
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
});

const fullTextStyleParams = z.object({
  text: z.string(),
  fontFamily: z.string().optional(),
  fontSizePx: z.number(),
  fontWeight: z.number().optional(),
  color: z.string(),
  align: z.enum(["left", "center", "right"]).optional(),
  maxWidthFrac: z.number().optional()
});

/** Case-supplied starting point for a run. */
export interface TimelineBridgeInitialState {
  fps?: number;
  width?: number;
  height?: number;
  tracks?: { name?: string; type: "video" | "audio" | "overlay" | "subtitle" }[];
  clips?: {
    name: string;
    trackIndex: number;
    mediaType?: TimelineClip["mediaType"];
    startMs: number;
    durationMs: number;
  }[];
}

/** Snapshot of the sequence handed to final-state predicates. */
export interface TimelineBridgeFinalState {
  fps: number;
  width: number;
  height: number;
  durationMs: number;
  playheadMs: number;
  tracks: { id: string; name: string; type: string; index: number }[];
  clips: {
    id: string;
    name: string;
    trackId: string;
    mediaType: string;
    startMs: number;
    durationMs: number;
    prompt?: string;
    animations: { role: string; preset: string }[];
  }[];
}

function tool(
  name: string,
  description: string,
  parameters: z.ZodTypeAny,
  impl: (args: Record<string, unknown>) => Promise<unknown>
): HeadlessTool {
  return {
    name,
    description,
    parameters,
    execute: (args) => {
      const parsed = parseWithTypeCoercion(parameters, args ?? {}) as Record<
        string,
        unknown
      >;
      return impl(parsed);
    }
  };
}

function capitalize(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

/**
 * Build an in-memory timeline bridge whose tools share the `ui_timeline_*`
 * contract but run headlessly against a plain sequence of tracks/clips (no
 * Zustand stores, no rendering).
 */
export function createTimelineToolBridge(
  initial: TimelineBridgeInitialState = {}
): HeadlessSurfaceBridge<TimelineBridgeFinalState> {
  const fps = initial.fps ?? 30;
  const width = initial.width ?? 1920;
  const height = initial.height ?? 1080;

  let playheadMs = 0;
  let selectedClipIds: string[] = [];
  let trackSeq = 0;
  let clipSeq = 0;
  let animSeq = 0;
  const tracks: TimelineTrack[] = [];
  let clips: TimelineClip[] = [];

  const nextTrackId = () => `track_${++trackSeq}`;
  const nextClipId = () => `clip_${++clipSeq}`;
  const nextAnimId = () => `anim_${++animSeq}`;

  function addTrackInternal(
    type: TimelineTrack["type"],
    name?: string
  ): TimelineTrack {
    const index = tracks.length;
    const track = makeTrack({
      id: nextTrackId(),
      type,
      name: name ?? `${capitalize(type)} ${index + 1}`,
      index
    });
    tracks.push(track);
    return track;
  }

  function findOrCreateTrack(type: TimelineTrack["type"]): TimelineTrack {
    const existing = tracks.find((t) => t.type === type);
    if (existing) return existing;
    return addTrackInternal(type);
  }

  function resolveTrack(idOrName: string): TimelineTrack {
    const byId = tracks.find((t) => t.id === idOrName);
    if (byId) return byId;
    const lower = idOrName.toLowerCase();
    const byName = tracks.find((t) => t.name.toLowerCase() === lower);
    if (byName) return byName;
    throw new Error(`No track found matching "${idOrName}".`);
  }

  function trackEndMs(trackId: string): number {
    return clips
      .filter((c) => c.trackId === trackId)
      .reduce((m, c) => Math.max(m, c.startMs + c.durationMs), 0);
  }

  function resolveClip(target: string): TimelineClip {
    if (target.toLowerCase() === "selected") {
      if (selectedClipIds.length !== 1) {
        throw new Error(
          `"selected" requires exactly one selected clip (currently ${selectedClipIds.length}).`
        );
      }
      const clip = clips.find((c) => c.id === selectedClipIds[0]);
      if (!clip) throw new Error("Selected clip no longer exists.");
      return clip;
    }
    const byId = clips.find((c) => c.id === target);
    if (byId) return byId;
    const lower = target.toLowerCase();
    const byName = clips.find((c) => c.name.toLowerCase() === lower);
    if (byName) return byName;
    throw new Error(`No clip found matching "${target}".`);
  }

  function serializeTrack(t: TimelineTrack) {
    return {
      id: t.id,
      name: t.name,
      type: t.type,
      index: t.index,
      visible: t.visible,
      locked: t.locked,
      muted: t.muted ?? false,
      solo: t.solo ?? false,
      clipCount: clips.filter((c) => c.trackId === t.id).length
    };
  }

  function serializeClip(c: TimelineClip) {
    const track = tracks.find((t) => t.id === c.trackId);
    return {
      id: c.id,
      name: c.name,
      trackId: c.trackId,
      trackName: track?.name ?? null,
      mediaType: c.mediaType,
      sourceType: c.sourceType,
      startMs: c.startMs,
      durationMs: c.durationMs,
      endMs: c.startMs + c.durationMs,
      inPointMs: c.inPointMs,
      outPointMs: c.outPointMs,
      status: c.status,
      prompt: c.prompt,
      provider: c.provider,
      model: c.model,
      voice: c.voice,
      animations: (c.animations ?? []).map((a) => ({
        role: a.role,
        preset: a.preset
      })),
      hidden: c.hidden ?? false,
      muted: c.muted ?? false,
      locked: c.locked,
      textStyle: c.textStyle,
      shapeStyle: c.shapeStyle
    };
  }

  // Seed initial tracks and clips.
  for (const t of initial.tracks ?? []) {
    addTrackInternal(t.type, t.name);
  }
  for (const c of initial.clips ?? []) {
    const track = tracks[c.trackIndex];
    if (!track) {
      throw new Error(
        `Initial clip "${c.name}" references trackIndex ${c.trackIndex}, but only ${tracks.length} track(s) exist.`
      );
    }
    clips.push(
      makeClip({
        id: nextClipId(),
        trackId: track.id,
        name: c.name,
        startMs: c.startMs,
        durationMs: c.durationMs,
        mediaType: c.mediaType ?? "video",
        sourceType: "imported",
        status: "generated"
      })
    );
  }

  const tools: HeadlessTool[] = [
    tool(
      "ui_timeline_get_state",
      "Read the specified timeline sequence: resolution + fps + duration, the playhead position, the current selection, every track, and every clip with its timing, media type, generation binding (prompt/provider/model/status) and render params. Call this first to discover what's on the timeline and to get the ids/names other timeline tools need.",
      z.object({}),
      async () => {
        const durationMs = clips.reduce(
          (m, c) => Math.max(m, c.startMs + c.durationMs),
          0
        );
        return {
          ok: true,
          sequenceId: "seq_eval",
          fps,
          width,
          height,
          durationMs,
          playheadMs,
          selectedClipIds: [...selectedClipIds],
          tracks: tracks.map(serializeTrack),
          clips: clips.map(serializeClip)
        };
      }
    ),

    tool(
      "ui_timeline_add_track",
      "Add a new track to the specified timeline sequence. `type` is one of video, audio, overlay, subtitle. Optionally provide a name.",
      z.object({
        type: z.enum(["video", "audio", "overlay", "subtitle"]),
        name: z.string().optional()
      }),
      async ({ type, name }) => {
        const track = addTrackInternal(
          type as TimelineTrack["type"],
          name as string | undefined
        );
        return { ok: true, track: serializeTrack(track) };
      }
    ),

    tool(
      "ui_timeline_add_text_clip",
      "Add authored text to the specified timeline sequence. It goes on an overlay track, creating one when needed, lasts 3000ms by default, and accepts the same motion presets as media clips.",
      z.object({
        text: z.string().trim().min(1),
        trackId: z.string().optional(),
        startMs: z.number().optional(),
        durationMs: z.number().optional(),
        style: textStyleParams.optional()
      }),
      async ({ text, trackId, startMs, durationMs, style }) => {
        const track = trackId
          ? resolveTrack(trackId as string)
          : findOrCreateTrack("overlay");
        const s = (style as z.infer<typeof textStyleParams> | undefined) ?? {};
        const clip = makeClip({
          id: nextClipId(),
          trackId: track.id,
          name: text as string,
          startMs: (startMs as number | undefined) ?? trackEndMs(track.id),
          durationMs:
            (durationMs as number | undefined) ?? DEFAULT_TEXT_CLIP_DURATION_MS,
          mediaType: "text",
          sourceType: "imported",
          status: "generated",
          textStyle: {
            text: text as string,
            fontFamily: s.fontFamily,
            fontSizePx: s.fontSizePx ?? DEFAULT_TEXT_CLIP_FONT_SIZE_PX,
            fontWeight: s.fontWeight,
            color: s.color ?? DEFAULT_TEXT_CLIP_COLOR,
            align: s.align,
            maxWidthFrac: s.maxWidthFrac
          }
        });
        clips.push(clip);
        selectedClipIds = [clip.id];
        return { ok: true, clip: serializeClip(clip) };
      }
    ),

    tool(
      "ui_timeline_add_shape_clip",
      "Add a rectangle, ellipse, or line on an overlay track of the specified timeline sequence. Omitted colors use a visible white fill for rectangles/ellipses or a visible white stroke for lines. Shapes are rasterized for preview/export and can use the standard motion presets.",
      z.object({
        shape: shapeStyleParams,
        trackId: z.string().optional(),
        startMs: z.number().optional(),
        durationMs: z.number().optional()
      }),
      async ({ shape, trackId, startMs, durationMs }) => {
        const track = trackId
          ? resolveTrack(trackId as string)
          : findOrCreateTrack("overlay");
        const shapeArg = shape as z.infer<typeof shapeStyleParams>;
        const isLine = shapeArg.kind === "line";
        const clip = makeClip({
          id: nextClipId(),
          trackId: track.id,
          name: capitalize(shapeArg.kind),
          startMs: (startMs as number | undefined) ?? trackEndMs(track.id),
          durationMs:
            (durationMs as number | undefined) ?? DEFAULT_TEXT_CLIP_DURATION_MS,
          mediaType: "shape",
          sourceType: "imported",
          status: "generated",
          shapeStyle: {
            kind: shapeArg.kind,
            fill: isLine ? shapeArg.fill : (shapeArg.fill ?? DEFAULT_SHAPE_FILL_COLOR),
            stroke: shapeArg.stroke ?? DEFAULT_SHAPE_STROKE_COLOR,
            strokeWidthPx: shapeArg.strokeWidthPx ?? DEFAULT_SHAPE_STROKE_WIDTH_PX,
            x: shapeArg.x,
            y: shapeArg.y,
            width: shapeArg.width,
            height: shapeArg.height,
            x2: shapeArg.x2,
            y2: shapeArg.y2
          }
        });
        clips.push(clip);
        selectedClipIds = [clip.id];
        return { ok: true, clip: serializeClip(clip) };
      }
    ),

    tool(
      "ui_timeline_generate_clip",
      'Generate a new media clip from a text prompt and place it on the specified timeline sequence. `kind` is text-to-video, text-to-image, or text-to-audio (TTS). Provide `provider` and `model` (discover valid ones with the model-search tool); when omitted the last-used model for that media kind is reused. `voice` is required for text-to-audio. Without a track the clip lands on a sensible track for its media kind; without `startMs` it is appended after the track\'s existing content. Generation starts immediately unless `autoGenerate` is false. For text-to-video, `aspectRatio` (e.g. "16:9") and `resolution` (e.g. "720p") and `durationMs` are honoured by video models.',
      z.object({
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
      async ({
        kind,
        prompt,
        trackId,
        startMs,
        durationMs,
        provider,
        model,
        voice,
        width: clipWidth,
        height: clipHeight,
        aspectRatio,
        resolution,
        autoGenerate
      }) => {
        const mediaType: TimelineClip["mediaType"] =
          kind === "text-to-video"
            ? "video"
            : kind === "text-to-image"
              ? "image"
              : "audio";

        const track = trackId
          ? resolveTrack(trackId as string)
          : kind === "text-to-audio"
            ? findOrCreateTrack("audio")
            : kind === "text-to-video"
              ? findOrCreateTrack("video")
              : (tracks.find((t) => t.type === "video" || t.type === "overlay") ??
                findOrCreateTrack("video"));

        const generationStarted = autoGenerate !== false;
        const clip = makeClip({
          id: nextClipId(),
          trackId: track.id,
          name: prompt as string,
          startMs: (startMs as number | undefined) ?? trackEndMs(track.id),
          durationMs:
            (durationMs as number | undefined) ??
            (kind === "text-to-audio" ? 3000 : 5000),
          mediaType,
          sourceType: "generated",
          bindingKind: kind as TimelineClip["bindingKind"],
          status: generationStarted ? "generating" : "draft",
          prompt: prompt as string,
          provider: provider as string | undefined,
          model: model as string | undefined,
          voice: voice as string | undefined,
          width: clipWidth as number | undefined,
          height: clipHeight as number | undefined,
          aspectRatio: aspectRatio as string | undefined,
          resolution: resolution as string | undefined
        });
        clips.push(clip);
        selectedClipIds = [clip.id];
        const result: {
          ok: true;
          clip: ReturnType<typeof serializeClip>;
          generationStarted: boolean;
          note?: string;
        } = { ok: true, clip: serializeClip(clip), generationStarted };
        if (!generationStarted) {
          result.note = "Generation not started (autoGenerate=false).";
        }
        return result;
      }
    ),

    tool(
      "ui_timeline_split_clip",
      "Cut a clip in two at the given time (the razor tool). `atMs` is an absolute time on the timeline and must fall inside the clip; omit it to split at the current playhead. Returns the two resulting halves.",
      z.object({
        target: targetParam,
        atMs: z.number().optional()
      }),
      async ({ target, atMs }) => {
        const clip = resolveClip(target as string);
        const at = (atMs as number | undefined) ?? playheadMs;
        const [left, right] = splitClip(clip, at);
        left.id = nextClipId();
        right.id = nextClipId();
        const idx = clips.findIndex((c) => c.id === clip.id);
        clips.splice(idx, 1, left, right);
        selectedClipIds = selectedClipIds.filter((id) => id !== clip.id);
        return { ok: true, clips: [serializeClip(left), serializeClip(right)] };
      }
    ),

    tool(
      "ui_timeline_trim_clip",
      "Trim a clip's length or its source in/out points. `durationMs` sets the on-timeline length; `inPointMs`/`outPointMs` set the trimmed source window (ms into the source media). Omit a field to leave it unchanged.",
      z.object({
        target: targetParam,
        durationMs: z.number().optional(),
        inPointMs: z.number().optional(),
        outPointMs: z.number().optional()
      }),
      async ({ target, durationMs, inPointMs, outPointMs }) => {
        const clip = resolveClip(target as string);
        if (durationMs !== undefined) clip.durationMs = durationMs as number;
        if (inPointMs !== undefined) clip.inPointMs = inPointMs as number;
        if (outPointMs !== undefined) clip.outPointMs = outPointMs as number;
        return { ok: true, clip: serializeClip(clip) };
      }
    ),

    tool(
      "ui_timeline_move_clip",
      "Move a clip to a new absolute start time and/or onto a different track. `startMs` is the new start on the timeline (ms, clamped to >= 0); `trackId` reassigns the track. Omit a field to leave it unchanged.",
      z.object({
        target: targetParam,
        startMs: z.number().optional(),
        trackId: z.string().optional()
      }),
      async ({ target, startMs, trackId }) => {
        const clip = resolveClip(target as string);
        if (startMs !== undefined) clip.startMs = Math.max(0, startMs as number);
        if (trackId !== undefined) {
          clip.trackId = resolveTrack(trackId as string).id;
        }
        return { ok: true, clip: serializeClip(clip) };
      }
    ),

    tool(
      "ui_timeline_delete_clip",
      "Remove a clip from the specified timeline sequence.",
      z.object({ target: targetParam }),
      async ({ target }) => {
        const clip = resolveClip(target as string);
        clips = clips.filter((c) => c.id !== clip.id);
        selectedClipIds = selectedClipIds.filter((id) => id !== clip.id);
        return { ok: true, deleted: serializeClip(clip) };
      }
    ),

    tool(
      "ui_timeline_duplicate_clip",
      "Duplicate a clip. The copy is placed immediately after the source (add `gapMs` for a gap) and keeps its generation binding so you can tweak the copy for a variation.",
      z.object({
        target: targetParam,
        gapMs: z.number().optional()
      }),
      async ({ target, gapMs }) => {
        const src = resolveClip(target as string);
        const copy: TimelineClip = {
          ...src,
          id: nextClipId(),
          startMs: src.startMs + src.durationMs + ((gapMs as number | undefined) ?? 0),
          versions: [],
          animations: src.animations?.map((a) => ({ ...a }))
        };
        clips.push(copy);
        selectedClipIds = [copy.id];
        return { ok: true, clip: serializeClip(copy) };
      }
    ),

    tool(
      "ui_timeline_set_clip_params",
      "Change a clip's render/audio params: `name`, `opacity` (0..1), `speedMultiplier` (0.1..8), `volumeDb`, `fadeInMs`, `fadeOutMs`, `blendMode`, `borderRadius`, `hidden`, `muted`, `locked`, a text clip's `textStyle`, or a shape clip's `shapeStyle`. Omit a field to leave it unchanged.",
      z.object({
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
        textStyle: fullTextStyleParams.optional(),
        shapeStyle: shapeStyleParams.optional()
      }),
      async ({ target, ...patch }) => {
        const clip = resolveClip(target as string);
        if (patch.name !== undefined) clip.name = patch.name as string;
        if (patch.opacity !== undefined) clip.opacity = patch.opacity as number;
        if (patch.speedMultiplier !== undefined)
          clip.speedMultiplier = patch.speedMultiplier as number;
        if (patch.volumeDb !== undefined) clip.volumeDb = patch.volumeDb as number;
        if (patch.fadeInMs !== undefined) clip.fadeInMs = patch.fadeInMs as number;
        if (patch.fadeOutMs !== undefined) clip.fadeOutMs = patch.fadeOutMs as number;
        if (patch.blendMode !== undefined)
          clip.blendMode = patch.blendMode as TimelineClip["blendMode"];
        if (patch.borderRadius !== undefined)
          clip.borderRadius = patch.borderRadius as number;
        if (patch.hidden !== undefined) clip.hidden = patch.hidden as boolean;
        if (patch.muted !== undefined) clip.muted = patch.muted as boolean;
        if (patch.locked !== undefined) clip.locked = patch.locked as boolean;
        if (patch.textStyle !== undefined)
          clip.textStyle = patch.textStyle as TimelineClip["textStyle"];
        if (patch.shapeStyle !== undefined)
          clip.shapeStyle = patch.shapeStyle as TimelineClip["shapeStyle"];
        return { ok: true, clip: serializeClip(clip) };
      }
    ),

    tool(
      "ui_timeline_set_clip_binding",
      "Edit a generated clip's generation binding — its `prompt`, `negativePrompt`, `provider`/`model`, TTS `voice`, dimensions, `aspectRatio`/`resolution`, `strength`, or `numInferenceSteps`. Set `regenerate` true to immediately re-run generation with the new settings. Only applies to generated clips.",
      z.object({
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
      async ({ target, ...patch }) => {
        const clip = resolveClip(target as string);
        if (clip.sourceType !== "generated") {
          throw new Error(
            `"${clip.name}" is not a generated clip — ui_timeline_set_clip_binding only applies to clips created with ui_timeline_generate_clip.`
          );
        }
        if (patch.prompt !== undefined) clip.prompt = patch.prompt as string;
        if (patch.negativePrompt !== undefined)
          clip.negativePrompt = patch.negativePrompt as string;
        if (patch.provider !== undefined) clip.provider = patch.provider as string;
        if (patch.model !== undefined) clip.model = patch.model as string;
        if (patch.voice !== undefined) clip.voice = patch.voice as string;
        if (patch.width !== undefined) clip.width = patch.width as number;
        if (patch.height !== undefined) clip.height = patch.height as number;
        if (patch.aspectRatio !== undefined)
          clip.aspectRatio = patch.aspectRatio as string;
        if (patch.resolution !== undefined)
          clip.resolution = patch.resolution as string;
        if (patch.strength !== undefined) clip.strength = patch.strength as number;
        if (patch.numInferenceSteps !== undefined)
          clip.numInferenceSteps = patch.numInferenceSteps as number;
        if (patch.regenerate) clip.status = "queued";
        return { ok: true, clip: serializeClip(clip) };
      }
    ),

    tool(
      "ui_timeline_animate_clip",
      'Attach motion-design animations to a clip — no keyframing, just named presets. Roles: `in` (entrance: fade, slide, pop, spin, wipe, blur, colorFade), `out` (exit: fade, slide, pop, spin, wipe, blur, colorFade), `emphasis` (mid-clip: pulse, flash, shake, bounce), `loop` (continuous: kenBurns, float, breathe, rotate). Each animation: `role`, `preset`, optional `durationMs` (defaults per preset), `delayMs`, `easing`, and preset `params`. On text clips, add `stagger` for per-word motion typography: each word runs the animation for `durationMs`, offset `stagger.offsetMs` from the previous word (`from`: start|end|center picks the leading word) — e.g. a pop-in title whose words land one after another. `mode` "replace" (default) swaps the clip\'s animations; "add" appends. Call ui_timeline_list_animation_presets for the full param list.',
      z.object({
        target: targetParam,
        mode: z.enum(["add", "replace"]).optional(),
        animations: z
          .array(
            z.object({
              role: animationRole,
              preset: z
                .string()
                .describe(
                  "Preset id, e.g. fade, slide, wipe, pop, kenBurns, float."
                ),
              durationMs: z.number().positive().optional(),
              delayMs: z.number().nonnegative().optional(),
              easing: z.string().optional(),
              params: z
                .record(z.string(), z.union([z.number(), z.string(), z.boolean()]))
                .optional(),
              stagger: z
                .object({
                  unit: z.literal("word"),
                  offsetMs: z
                    .number()
                    .positive()
                    .describe("Delay between successive words in ms."),
                  from: z.enum(["start", "end", "center"]).optional()
                })
                .optional()
                .describe(
                  "Per-word stagger — text clips only. The animation runs once per word, each word offset from the previous."
                )
            })
          )
          .min(1)
      }),
      async ({ target, mode, animations }) => {
        const clip = resolveClip(target as string);
        const inputs = animations as Array<{
          role: ClipAnimation["role"];
          preset: string;
          durationMs?: number;
          delayMs?: number;
          easing?: ClipAnimation["easing"];
          params?: ClipAnimation["params"];
          stagger?: ClipAnimation["stagger"];
        }>;
        const built: ClipAnimation[] = inputs.map((input) => {
          const preset = ANIMATION_PRESETS.find((p) => p.id === input.preset);
          if (!preset) {
            const ids = ANIMATION_PRESETS.map((p) => p.id).join(", ");
            throw new Error(
              `Unknown animation preset "${input.preset}". Valid presets: ${ids}.`
            );
          }
          if (!preset.roles.includes(input.role)) {
            throw new Error(
              `Preset "${input.preset}" does not support role "${input.role}". Valid roles for "${input.preset}": ${preset.roles.join(", ")}.`
            );
          }
          return {
            id: nextAnimId(),
            role: input.role,
            preset: input.preset,
            durationMs: input.durationMs ?? preset.defaultDurationMs,
            delayMs: input.delayMs,
            easing: input.easing,
            params: input.params,
            stagger: input.stagger
          };
        });
        clip.animations =
          (mode as string | undefined) === "add"
            ? [...(clip.animations ?? []), ...built]
            : built;
        return { ok: true, clip: serializeClip(clip) };
      }
    ),

    tool(
      "ui_timeline_clear_animations",
      "Remove motion-design animations from a clip. Pass `role` to clear only that role (in/out/emphasis/loop); omit it to clear all.",
      z.object({
        target: targetParam,
        role: animationRole.optional()
      }),
      async ({ target, role }) => {
        const clip = resolveClip(target as string);
        clip.animations = role
          ? (clip.animations ?? []).filter((a) => a.role !== role)
          : [];
        return { ok: true, clip: serializeClip(clip) };
      }
    ),

    tool(
      "ui_timeline_list_animation_presets",
      "List the motion-design animation presets: id, allowed roles, params (with defaults and ranges), default duration/easing, and a one-line description. Use this to discover the exact preset names and params for ui_timeline_animate_clip.",
      z.object({}),
      async () => {
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
    ),

    tool(
      "ui_timeline_select_clip",
      "Select a clip in the specified timeline sequence (driving the inspector). Pass null/empty to clear the selection.",
      z.object({ target: targetParam.nullable().optional() }),
      async ({ target }) => {
        const t = target as string | null | undefined;
        if (!t) {
          selectedClipIds = [];
          return { ok: true, selected: null };
        }
        const clip = resolveClip(t);
        selectedClipIds = [clip.id];
        return { ok: true, selected: serializeClip(clip) };
      }
    ),

    tool(
      "ui_timeline_seek",
      "Move the playhead to an absolute time (ms) in the specified timeline sequence. Useful before splitting at the playhead.",
      z.object({ timeMs: z.number() }),
      async ({ timeMs }) => {
        playheadMs = Math.max(0, timeMs as number);
        return { ok: true, playheadMs };
      }
    )
  ];

  return {
    tools,
    finalState: (): TimelineBridgeFinalState => ({
      fps,
      width,
      height,
      durationMs: clips.reduce(
        (m, c) => Math.max(m, c.startMs + c.durationMs),
        0
      ),
      playheadMs,
      tracks: tracks.map((t) => ({
        id: t.id,
        name: t.name,
        type: t.type,
        index: t.index
      })),
      clips: clips.map((c) => ({
        id: c.id,
        name: c.name,
        trackId: c.trackId,
        mediaType: c.mediaType,
        startMs: c.startMs,
        durationMs: c.durationMs,
        prompt: c.prompt,
        animations: (c.animations ?? []).map((a) => ({
          role: a.role,
          preset: a.preset
        }))
      }))
    })
  };
}

const TIMELINE_SYSTEM_PROMPT = `You are an assistant driving a timeline / video editor through UI tools.

Use the ui_timeline_* tools to inspect and modify the sequence:
- Call ui_timeline_get_state first to see what's already there and get track/clip ids and names.
- Add content with ui_timeline_add_text_clip, ui_timeline_add_shape_clip, or ui_timeline_generate_clip; add tracks with ui_timeline_add_track when needed.
- Address existing clips by id, name, or "selected" with ui_timeline_split_clip, ui_timeline_trim_clip, ui_timeline_move_clip, ui_timeline_delete_clip, ui_timeline_duplicate_clip, ui_timeline_set_clip_params, ui_timeline_set_clip_binding, ui_timeline_animate_clip, ui_timeline_clear_animations, ui_timeline_select_clip.
- Before animating a clip, call ui_timeline_list_animation_presets to discover the exact preset ids, allowed roles, and params.
- ui_timeline_seek moves the playhead (useful before a playhead-relative split).

Call one tool at a time and use the result before the next call. When the objective is fully satisfied, STOP calling tools and give a one-line summary.`;

export const TIMELINE_TOOL_LOOP_CASES: readonly ToolLoopEvalCase<TimelineBridgeFinalState>[] =
  [
    {
      id: "titles-with-motion",
      description: "Add a text clip and give it a fade-in entrance animation",
      objective:
        "Add a text clip that says 'Hello' and give it a fade-in entrance animation.",
      createBridge: () => createTimelineToolBridge(),
      systemPrompt: TIMELINE_SYSTEM_PROMPT,
      expect: {
        requiredTools: ["ui_timeline_add_text_clip", "ui_timeline_animate_clip"],
        ordering: [["ui_timeline_add_text_clip", "ui_timeline_animate_clip"]],
        noErrorResults: true,
        minToolCalls: 2,
        maxToolCalls: 12,
        finalState: [
          {
            name: "hasAnimatedTextClip",
            detail: "no text clip with an 'in' animation",
            test: (s) =>
              s.clips.some(
                (c) =>
                  c.mediaType === "text" &&
                  c.animations.some((a) => a.role === "in")
              )
          }
        ]
      }
    },
    {
      id: "generate-and-arrange",
      description: "Generate a video clip and move it to a specific start time",
      objective:
        "Add a video track, generate a text-to-video clip on it, then move the clip to start at 2000ms on the timeline.",
      createBridge: () => createTimelineToolBridge(),
      systemPrompt: TIMELINE_SYSTEM_PROMPT,
      expect: {
        requiredTools: ["ui_timeline_generate_clip", "ui_timeline_move_clip"],
        noErrorResults: true,
        minToolCalls: 2,
        maxToolCalls: 12,
        finalState: [
          {
            name: "hasGeneratedVideoClipAt2000",
            detail: "no generated video clip at startMs=2000 with a prompt",
            test: (s) =>
              s.clips.some(
                (c) =>
                  c.mediaType === "video" && c.startMs === 2000 && !!c.prompt
              )
          }
        ]
      }
    },
    {
      id: "cut-and-trim",
      description: "Split a clip and delete the second half",
      objective:
        "The timeline has one video clip named 'shot' running from 0ms to 6000ms. Split it at 3000ms and delete the second half.",
      createBridge: () =>
        createTimelineToolBridge({
          tracks: [{ type: "video" }],
          clips: [
            {
              name: "shot",
              trackIndex: 0,
              mediaType: "video",
              startMs: 0,
              durationMs: 6000
            }
          ]
        }),
      systemPrompt: TIMELINE_SYSTEM_PROMPT,
      userPrompt:
        "Objective: The timeline has one video clip named 'shot' running from 0ms to 6000ms. Split it at 3000ms and delete the second half.",
      expect: {
        requiredTools: ["ui_timeline_split_clip", "ui_timeline_delete_clip"],
        noErrorResults: true,
        minToolCalls: 2,
        maxToolCalls: 12,
        finalState: [
          {
            name: "oneClipLeftAt3000ms",
            detail: "expected exactly 1 clip with durationMs 3000",
            test: (s) => s.clips.length === 1 && s.clips[0].durationMs === 3000
          }
        ]
      }
    }
  ];
