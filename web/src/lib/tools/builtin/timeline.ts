import {
  applyTimelineOp,
  timelineOpFromToolArgs,
  type TimelineOp
} from "@nodetool-ai/timeline/ops";
import { z } from "zod";
import { trpcClient } from "../../../trpc/client";
import {
  findInstrumentPreset,
  listMidiInstruments,
  MIDI_INSTRUMENT_PRESETS,
  ANIMATED_PROPERTIES,
  ANIMATION_PRESETS,
  CUSTOM_ANIMATION_CONTRACT,
  DEFAULT_BEAT_TOLERANCE_MS,
  STAGGER_UNITS,
  type MidiInstrument
} from "@nodetool-ai/timeline";
import {
  resolveDeleteTrackArgs,
  resolveMoveTrackArgs,
  resolveShapeArg,
  textStylePatchParams,
  type MidiNoteParams
} from "@nodetool-ai/protocol/api-schemas/timeline-tool-params.js";
import {
  buildTimelineToolContracts,
  liftCustomAnimation,
  type TimelineToolArgs,
  type TimelineToolName
} from "@nodetool-ai/protocol/api-schemas/timeline-tool-contracts.js";
import { uiToolParams } from "@nodetool-ai/protocol/api-schemas/ui-tool-contract.js";
import { FrontendToolRegistry } from "../frontendTools";
import {
  getTimelineAgentHandler,
  type ClipAnimationInput,
  type MidiNoteInput
} from "../../../components/timeline/timelineAgentBridge";
import { docUrl } from "./resourceLinks";

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
 * The `ui_timeline_*` contracts, shared with the headless eval bridge
 * (`packages/agents/src/evals/surfaces/timeline.ts`). The vocabulary comes from
 * `@nodetool-ai/timeline`, which the protocol package sits below.
 */
const TIMELINE_CONTRACTS = buildTimelineToolContracts({
  staggerUnits: STAGGER_UNITS,
  animatedProperties: ANIMATED_PROPERTIES,
  beatToleranceMs: DEFAULT_BEAT_TOLERANCE_MS
});

/**
 * The name, description and parameters of one shared tool: the contract's own
 * fields plus the browser's `timeline_id` — the one field the headless bridge
 * has no use for, since it drives a single implicit sequence.
 */
interface SharedTimelineTool<K extends TimelineToolName> {
  name: K;
  description: string;
  parameters: z.ZodType<TimelineToolArgs<K> & { timeline_id: string }>;
}

/**
 * `uiToolParams` answers `z.ZodType` because a contract's `finalize` may close
 * or reopen the object, so the cast names the argument type its shape already
 * fixes — which is what `execute` destructures.
 */
const shared = <K extends TimelineToolName>(
  name: K
): SharedTimelineTool<K> => ({
  name,
  description: TIMELINE_CONTRACTS[name].description,
  parameters: uiToolParams(TIMELINE_CONTRACTS[name], {
    timeline_id: timelineIdParam
  }) as unknown as SharedTimelineTool<K>["parameters"]
});

/**
 * The same, for an op that reads a static catalog and so names no sequence —
 * it answers with no editor open, which is what its own test asserts.
 */
const sharedWithoutSequence = <K extends TimelineToolName>(name: K) => ({
  name,
  description: TIMELINE_CONTRACTS[name].description,
  parameters: uiToolParams(TIMELINE_CONTRACTS[name])
});

/** Runs an op that reads a static catalog, so it needs no open sequence. */
const applyStaticTimelineOp = async (op: TimelineOp) => {
  const outcome = await applyTimelineOp(
    {
      fps: 30,
      width: 1920,
      height: 1080,
      tracks: [],
      clips: [],
      markers: [],
      playheadMs: 0,
      selectedClipIds: []
    },
    op,
    { newId: () => "unused" }
  );
  if (outcome.error) {
    throw new Error(outcome.error);
  }
  return outcome.result;
};

/** One note as the tool schema writes it, in the document's own field names. */
const toNoteInput = (note: MidiNoteParams): MidiNoteInput => {
  const input: MidiNoteInput = {
    pitch: note.pitch,
    startTick: note.start_tick,
    durationTick: note.duration_tick
  };
  if (note.id !== undefined) {
    input.id = note.id;
  }
  if (note.velocity !== undefined) {
    input.velocity = note.velocity;
  }
  if (note.muted !== undefined) {
    input.muted = note.muted;
  }
  if (note.channel !== undefined) {
    input.channel = note.channel;
  }
  if (note.release_velocity !== undefined) {
    input.releaseVelocity = note.release_velocity;
  }
  if (note.expression !== undefined) {
    input.expression = note.expression;
  }
  return input;
};

/**
 * A voice, either spelled out or named. A preset is resolved to the full
 * instrument here rather than stored as a reference, so the track keeps the
 * sound it was given after the preset table changes.
 */
const resolveInstrumentArg = (
  instrument: MidiInstrument | { preset: string }
): { instrument: MidiInstrument } | { error: string } => {
  if (!("preset" in instrument)) {
    return { instrument };
  }
  const preset = findInstrumentPreset(instrument.preset);
  if (!preset) {
    return {
      error: `No instrument preset named "${instrument.preset}". Valid ids: ${MIDI_INSTRUMENT_PRESETS.map(
        (p) => p.id
      ).join(", ")}.`
    };
  }
  return { instrument: preset.instrument };
};

FrontendToolRegistry.register({
  ...shared("ui_timeline_get_state"),
  async execute({ timeline_id, clip, track }) {
    const handler = getTimelineAgentHandler(timeline_id);
    const snapshot = handler.getSnapshot();
    if (clip === undefined && track === undefined) {
      return { ok: true, ...snapshot };
    }
    // The detail reads (a clip's notes, a track's automation) come from the
    // op the headless bridge runs, so both hosts answer with the same shape.
    const detail = await handler.applyOp(
      timelineOpFromToolArgs("get_state", { clip, track })
    );
    const result: Record<string, unknown> = { ok: true, ...snapshot };
    if (detail.clipDetail !== undefined) result.clipDetail = detail.clipDetail;
    if (detail.trackDetail !== undefined) result.trackDetail = detail.trackDetail;
    return result;
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_retarget_format"),
  async execute({
    timeline_id,
    aspect_ratio,
    strategy,
    safe_margin,
    track_ids
  }) {
    const result = await getTimelineAgentHandler(timeline_id).retargetFormat({
      aspectRatio: aspect_ratio,
      strategy,
      safeMargin: safe_margin,
      trackIds: track_ids
    });
    return {
      ok: true,
      timeline_id: result.sequenceId,
      name: result.name,
      url: docUrl("timeline", result.sequenceId)
    };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_set_reframe_subject"),
  async execute({ timeline_id, clip_id, track_id, safe_margin, smoothing }) {
    const options: { safeMargin?: number; smoothing?: number } = {};
    if (safe_margin !== undefined) options.safeMargin = safe_margin;
    if (smoothing !== undefined) options.smoothing = smoothing;
    const clip = await getTimelineAgentHandler(timeline_id).setReframeSubject(
      clip_id,
      track_id,
      options
    );
    return { ok: true, clip, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_add_reframe_keyframe"),
  async execute({ timeline_id, clip_id, source_ms, x, y, zoom }) {
    const clip = await getTimelineAgentHandler(timeline_id).addReframeKeyframe(
      clip_id,
      { sourceMs: source_ms, x, y, zoom }
    );
    return { ok: true, clip, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_clear_reframe"),
  async execute({ timeline_id, clip_id }) {
    const clip =
      await getTimelineAgentHandler(timeline_id).clearReframe(clip_id);
    return { ok: true, clip, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_add_track"),
  async execute({ timeline_id, type, name }) {
    const track = await getTimelineAgentHandler(timeline_id).addTrack(
      type,
      name
    );
    return { ok: true, track, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_move_track"),
  async execute({ timeline_id, ...rest }) {
    const { target, toIndex, before, after } = resolveMoveTrackArgs(rest);
    const tracks = await getTimelineAgentHandler(timeline_id).moveTrack(
      target,
      {
        toIndex,
        before,
        after
      }
    );
    return { ok: true, tracks, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_delete_track"),
  async execute({ timeline_id, ...rest }) {
    const { target, deleteClips } = resolveDeleteTrackArgs(rest);
    const result = await getTimelineAgentHandler(timeline_id).deleteTrack(
      target,
      deleteClips
    );
    return { ok: true, ...result, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_add_media_clip"),
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
  ...shared("ui_timeline_add_text_clip"),
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
    const clip = await getTimelineAgentHandler(timeline_id).addTextClip({
      text,
      trackId,
      startMs,
      durationMs,
      opacity,
      // `style` wins over a top-level twin: a caller that sent both meant the
      // bag it named.
      style: { ...loose, ...(style ?? {}) }
    });
    return {
      ok: true,
      clip,
      url: docUrl("timeline", timeline_id, { key: "clip", value: clip.id })
    };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_add_shape_clip"),
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
    const clip = await getTimelineAgentHandler(timeline_id).addShapeClip({
      shape: resolveShapeArg(shape, shapeStyle, loose),
      trackId,
      startMs,
      durationMs,
      opacity
    });
    return {
      ok: true,
      clip,
      url: docUrl("timeline", timeline_id, { key: "clip", value: clip.id })
    };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_add_model3d_clip"),
  async execute({ timeline_id, assetId, trackId, startMs, durationMs, style }) {
    const clip = await getTimelineAgentHandler(timeline_id).addModel3DClip({
      assetId,
      trackId,
      startMs,
      durationMs,
      style
    });
    return {
      ok: true,
      clip,
      url: docUrl("timeline", timeline_id, { key: "clip", value: clip.id })
    };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_set_model3d_style"),
  async execute({ timeline_id, target, patch, keyAtMs, keyEasing }) {
    const handler = getTimelineAgentHandler(timeline_id);
    if (keyAtMs !== undefined || keyEasing !== undefined) {
      // A camera key reports the keyed pose, which only the op returns.
      const result = await handler.applyOp(
        timelineOpFromToolArgs("set_model3d_style", {
          target,
          patch,
          keyAtMs,
          keyEasing
        })
      );
      return { ...result, url: docUrl("timeline", timeline_id) };
    }
    const clip = await handler.setModel3DStyle(target, patch);
    return { ok: true, clip };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_apply_model3d_camera_move"),
  async execute({ timeline_id, ...args }) {
    const result = await getTimelineAgentHandler(timeline_id).applyOp(
      timelineOpFromToolArgs("apply_model3d_camera_move", args)
    );
    return { ...result, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_bake_model3d_clip"),
  async execute({ timeline_id, target }) {
    const clip =
      await getTimelineAgentHandler(timeline_id).bakeModel3DClip(target);
    return {
      ok: true,
      clip,
      bakeStarted: true,
      url: docUrl("timeline", timeline_id, { key: "clip", value: clip.id })
    };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_render_model3d_reference"),
  async execute({ timeline_id, ...args }) {
    const result = await getTimelineAgentHandler(timeline_id).applyOp(
      timelineOpFromToolArgs("render_model3d_reference", args)
    );
    return { ...result, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_generate_clip"),
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
  ...shared("ui_timeline_generatively_edit_clip"),
  async execute({ timeline_id, clip_id, instruction, provider, model }) {
    const result = await getTimelineAgentHandler(
      timeline_id
    ).generativelyEditClip({
      clipId: clip_id,
      instruction,
      provider,
      model
    });
    return {
      ok: true,
      ...result,
      url: docUrl("timeline", timeline_id, { key: "clip", value: clip_id })
    };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_apply_take"),
  async execute({ timeline_id, clip_id, take_id }) {
    const clip = getTimelineAgentHandler(timeline_id).applyTake(
      clip_id,
      take_id
    );
    return {
      ok: true,
      clip,
      url: docUrl("timeline", timeline_id, { key: "clip", value: clip.id })
    };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_split_clip"),
  async execute({ timeline_id, target, atMs, atBar, beat, crossing }) {
    const clips = await getTimelineAgentHandler(timeline_id).splitClip(
      target,
      atMs,
      { atBar, beat, crossing }
    );
    return { ok: true, clips, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_trim_clip"),
  async execute({
    timeline_id,
    target,
    startMs,
    durationMs,
    inPointMs,
    outPointMs,
    atBar,
    beat
  }) {
    const clip = await getTimelineAgentHandler(timeline_id).trimClip(target, {
      startMs,
      durationMs,
      inPointMs,
      outPointMs,
      atBar,
      beat
    });
    return {
      ok: true,
      clip,
      url: docUrl("timeline", timeline_id, { key: "clip", value: clip.id })
    };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_move_clip"),
  async execute({ timeline_id, target, startMs, trackId, atBar, beat }) {
    const clip = await getTimelineAgentHandler(timeline_id).moveClip(target, {
      startMs,
      trackId,
      atBar,
      beat
    });
    return {
      ok: true,
      clip,
      url: docUrl("timeline", timeline_id, { key: "clip", value: clip.id })
    };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_delete_clip"),
  async execute({ timeline_id, target }) {
    const clip = await getTimelineAgentHandler(timeline_id).deleteClip(target);
    return { ok: true, deleted: clip, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_duplicate_clip"),
  async execute({ timeline_id, target, gapMs, count, atBar, beat }) {
    const { clips, children, ...clip } = await getTimelineAgentHandler(
      timeline_id
    ).duplicateClip(target, gapMs, { count, atBar, beat });
    const result: Record<string, unknown> = { ok: true, clip };
    if (clips) result.clips = clips;
    if (children) result.children = children;
    result.url = docUrl("timeline", timeline_id, { key: "clip", value: clip.id });
    return result;
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_set_clip_params"),
  // The shared shape says `textStyle` is the whole bag; the op merges a patch
  // over the clip's own. Overridden here and in the headless bridge until the
  // contract carries `textStylePatchParams`.
  parameters: z
    .object({
      timeline_id: timelineIdParam,
      ...TIMELINE_CONTRACTS.ui_timeline_set_clip_params.shape,
      textStyle: textStylePatchParams.optional()
    })
    .catchall(z.unknown()),
  async execute({ timeline_id, ...args }) {
    const result = await getTimelineAgentHandler(timeline_id).applyOp(
      timelineOpFromToolArgs("set_clip_params", args)
    );
    return { ...result, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_add_group"),
  async execute({ timeline_id, ...args }) {
    const result = await getTimelineAgentHandler(timeline_id).addGroup(args);
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
  ...shared("ui_timeline_set_parent"),
  async execute({ timeline_id, target, parentId }) {
    const clip = await getTimelineAgentHandler(timeline_id).setParent(
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
  ...shared("ui_timeline_set_transition"),
  async execute({ timeline_id, target, transition }) {
    const clip = await getTimelineAgentHandler(timeline_id).setTransition(
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
  ...shared("ui_timeline_set_mask"),
  async execute({ timeline_id, target, mask }) {
    const clip = await getTimelineAgentHandler(timeline_id).setMask(
      target,
      mask
    );
    return {
      ok: true,
      clip,
      url: docUrl("timeline", timeline_id, { key: "clip", value: clip.id })
    };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_set_matte"),
  async execute({ timeline_id, target, matte }) {
    const clip = await getTimelineAgentHandler(timeline_id).setMatte(
      target,
      matte
    );
    return {
      ok: true,
      clip,
      url: docUrl("timeline", timeline_id, { key: "clip", value: clip.id })
    };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_set_effects"),
  async execute({ timeline_id, target, effects }) {
    const clip = await getTimelineAgentHandler(timeline_id).setEffects(
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
  ...shared("ui_timeline_set_clip_binding"),
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
  ...shared("ui_timeline_animate_clip"),
  async execute({ timeline_id, target, mode, animations }) {
    const clip = await getTimelineAgentHandler(timeline_id).setClipAnimations(
      target,
      // `{preset: "custom", custom: {curves}}` reads as naturally as the flat
      // form, so lift it rather than handing the editor an animation with
      // neither curves nor code. The units come from the engine's own
      // STAGGER_UNITS, which `z.enum` widened to string on the way through the
      // contract.
      animations.map(liftCustomAnimation) as ClipAnimationInput[],
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
  ...shared("ui_timeline_stagger_animations"),
  async execute({ timeline_id, clip_ids, offset_ms }) {
    const clips = await getTimelineAgentHandler(timeline_id).staggerAnimations(
      clip_ids,
      offset_ms
    );
    return { ok: true, clips, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_clear_animations"),
  async execute({ timeline_id, target, role }) {
    const clip = await getTimelineAgentHandler(timeline_id).clearClipAnimations(
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
  ...sharedWithoutSequence("ui_timeline_list_animation_presets"),
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
  ...sharedWithoutSequence("ui_timeline_list_instruments"),
  async execute() {
    return { ok: true, instruments: listMidiInstruments() };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_get_clip_frames"),
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
  ...shared("ui_timeline_select_clip"),
  async execute({ timeline_id, target }) {
    const clip = getTimelineAgentHandler(timeline_id).selectClip(
      target ?? null
    );
    return { ok: true, selected: clip };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_seek"),
  async execute({ timeline_id, timeMs }) {
    const playheadMs = getTimelineAgentHandler(timeline_id).seek(timeMs);
    return { ok: true, playheadMs };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_add_marker"),
  async execute({ timeline_id, ...opts }) {
    const marker = await getTimelineAgentHandler(timeline_id).addMarker(opts);
    return { ok: true, marker, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_delete_marker"),
  async execute({ timeline_id, target }) {
    const deleted =
      await getTimelineAgentHandler(timeline_id).deleteMarker(target);
    return { ok: true, deleted, url: docUrl("timeline", timeline_id) };
  }
});

// ── Guided video flow (PRD § 8.6) ───────────────────────────────────────────

FrontendToolRegistry.register({
  ...shared("ui_timeline_set_setup"),
  async execute({ timeline_id, ...patch }) {
    const setup = await getTimelineAgentHandler(timeline_id).setSetup(patch);
    return { ok: true, setup, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_plan_beats"),
  async execute({ timeline_id, ...opts }) {
    const beats = await getTimelineAgentHandler(timeline_id).planBeats(opts);
    // Named in the answer because it is the tool's contract: the plan is text
    // and costs nothing until generate_from_beats runs (D4).
    return {
      ok: true,
      beats,
      clipsCreated: 0,
      jobsStarted: 0,
      url: docUrl("timeline", timeline_id)
    };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_update_beat"),
  async execute({ timeline_id, beat, ...patch }) {
    const updated = await getTimelineAgentHandler(timeline_id).updateBeat(
      beat,
      patch
    );
    return { ok: true, beat: updated, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_remove_beat"),
  async execute({ timeline_id, beat }) {
    const removed = await getTimelineAgentHandler(timeline_id).removeBeat(beat);
    return { ok: true, removed, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_generate_from_beats"),
  async execute({ timeline_id, ...opts }) {
    const result =
      await getTimelineAgentHandler(timeline_id).generateFromBeats(opts);
    return { ok: true, ...result, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_add_midi_clip"),
  async execute({ timeline_id, track, start_ms, duration_ms, name, notes }) {
    const clip = await getTimelineAgentHandler(timeline_id).addMidiClip({
      trackId: track,
      startMs: start_ms,
      durationMs: duration_ms,
      name,
      notes: (notes ?? []).map(toNoteInput)
    });
    return {
      ok: true,
      clip,
      url: docUrl("timeline", timeline_id, { key: "clip", value: clip.id })
    };
  }
});

function clipDocUrl(
  timelineId: string,
  result: Record<string, unknown>
): string {
  const clip = result.clip;
  const clipId =
    typeof clip === "object" &&
    clip !== null &&
    typeof (clip as { id?: unknown }).id === "string"
      ? (clip as { id: string }).id
      : undefined;
  return clipId
    ? docUrl("timeline", timelineId, { key: "clip", value: clipId })
    : docUrl("timeline", timelineId);
}

FrontendToolRegistry.register({
  ...shared("ui_timeline_set_notes"),
  async execute({ timeline_id, ...args }) {
    const result = await getTimelineAgentHandler(timeline_id).applyOp(
      timelineOpFromToolArgs("set_notes", args)
    );
    return { ...result, url: clipDocUrl(timeline_id, result) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_set_tempo"),
  async execute({ timeline_id, ...args }) {
    // The op keeps the offset, the signature and the project key the call
    // leaves out, as the headless bridge does.
    const result = await getTimelineAgentHandler(timeline_id).applyOp(
      timelineOpFromToolArgs("set_tempo", args)
    );
    return { ...result, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_set_track_instrument"),
  async execute({ timeline_id, track, instrument }) {
    const resolved = resolveInstrumentArg(instrument);
    if ("error" in resolved) {
      return { ok: false, error: resolved.error };
    }
    if (resolved.instrument.type === "sampler") {
      resolved.instrument = {
        ...resolved.instrument,
        zones: await Promise.all(
          resolved.instrument.zones.map(async (zone) => {
            const asset = await trpcClient.assets.get.query({
              id: zone.assetId
            });
            if (!asset.content_type.startsWith("audio/"))
              throw new Error(`Audio sample unavailable: ${zone.name}`);
            return { ...zone, assetId: asset.id };
          })
        )
      };
    }
    const updated = await getTimelineAgentHandler(
      timeline_id
    ).setTrackInstrument(track, resolved.instrument);
    return { ok: true, track: updated, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_transpose_clip"),
  async execute({ timeline_id, ...args }) {
    const result = await getTimelineAgentHandler(timeline_id).applyOp(
      timelineOpFromToolArgs("transpose_clip", args)
    );
    return { ...result, url: clipDocUrl(timeline_id, result) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_quantize_notes"),
  async execute({ timeline_id, ...args }) {
    const result = await getTimelineAgentHandler(timeline_id).applyOp(
      timelineOpFromToolArgs("quantize_notes", args)
    );
    return { ...result, url: clipDocUrl(timeline_id, result) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_scale_velocity"),
  async execute({ timeline_id, ...args }) {
    const result = await getTimelineAgentHandler(timeline_id).applyOp(
      timelineOpFromToolArgs("scale_velocity", args)
    );
    return { ...result, url: clipDocUrl(timeline_id, result) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_set_time_remap"),
  async execute({ timeline_id, target, timeRemap }) {
    const clip = await getTimelineAgentHandler(timeline_id).setTimeRemap(
      target,
      timeRemap
    );
    return {
      ok: true,
      clip,
      url: docUrl("timeline", timeline_id, { key: "clip", value: clip.id })
    };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_set_markers_from_beats"),
  async execute({ timeline_id, ...args }) {
    const result = await getTimelineAgentHandler(timeline_id).applyOp(
      timelineOpFromToolArgs("set_markers_from_beats", args)
    );
    return { ...result, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_snap_to_beats"),
  async execute({ timeline_id, ...args }) {
    const result = await getTimelineAgentHandler(timeline_id).applyOp(
      timelineOpFromToolArgs("snap_to_beats", args)
    );
    return { ...result, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_set_track"),
  async execute({ timeline_id, ...args }) {
    const result = await getTimelineAgentHandler(timeline_id).applyOp(
      timelineOpFromToolArgs("set_track", args)
    );
    return { ...result, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_ripple_delete"),
  async execute({ timeline_id, ...args }) {
    const result = await getTimelineAgentHandler(timeline_id).applyOp(
      timelineOpFromToolArgs("ripple_delete", args)
    );
    return { ...result, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_set_chords"),
  async execute({ timeline_id, ...args }) {
    const result = await getTimelineAgentHandler(timeline_id).applyOp(
      timelineOpFromToolArgs("set_chords", args)
    );
    return { ...result, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_clear_chords"),
  async execute({ timeline_id, ...args }) {
    const result = await getTimelineAgentHandler(timeline_id).applyOp(
      timelineOpFromToolArgs("clear_chords", args)
    );
    return { ...result, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_loop_clip"),
  async execute({ timeline_id, ...args }) {
    const result = await getTimelineAgentHandler(timeline_id).applyOp(
      timelineOpFromToolArgs("loop_clip", args)
    );
    return { ...result, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_join_clips"),
  async execute({ timeline_id, ...args }) {
    const result = await getTimelineAgentHandler(timeline_id).applyOp(
      timelineOpFromToolArgs("join_clips", args)
    );
    return { ...result, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_insert_time"),
  async execute({ timeline_id, ...args }) {
    const result = await getTimelineAgentHandler(timeline_id).applyOp(
      timelineOpFromToolArgs("insert_time", args)
    );
    return { ...result, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_delete_time"),
  async execute({ timeline_id, ...args }) {
    const result = await getTimelineAgentHandler(timeline_id).applyOp(
      timelineOpFromToolArgs("delete_time", args)
    );
    return { ...result, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_duplicate_range"),
  async execute({ timeline_id, ...args }) {
    const result = await getTimelineAgentHandler(timeline_id).applyOp(
      timelineOpFromToolArgs("duplicate_range", args)
    );
    return { ...result, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_paste_range"),
  async execute({ timeline_id, ...args }) {
    const result = await getTimelineAgentHandler(timeline_id).applyOp(
      timelineOpFromToolArgs("paste_range", args)
    );
    return { ...result, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  ...sharedWithoutSequence("ui_timeline_list_progressions"),
  async execute() {
    return applyStaticTimelineOp(
      timelineOpFromToolArgs("list_progressions", {})
    );
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_apply_progression"),
  async execute({ timeline_id, ...args }) {
    const result = await getTimelineAgentHandler(timeline_id).applyOp(
      timelineOpFromToolArgs("apply_progression", args)
    );
    return { ...result, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_transpose_chords"),
  async execute({ timeline_id, ...args }) {
    const result = await getTimelineAgentHandler(timeline_id).applyOp(
      timelineOpFromToolArgs("transpose_chords", args)
    );
    return { ...result, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_detect_chords"),
  async execute({ timeline_id, ...args }) {
    const result = await getTimelineAgentHandler(timeline_id).applyOp(
      timelineOpFromToolArgs("detect_chords", args)
    );
    return { ...result, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_set_clip_harmony"),
  async execute({ timeline_id, ...args }) {
    const result = await getTimelineAgentHandler(timeline_id).applyOp(
      timelineOpFromToolArgs("set_clip_harmony", args)
    );
    return { ...result, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  ...sharedWithoutSequence("ui_timeline_list_harmony_presets"),
  async execute() {
    return applyStaticTimelineOp(
      timelineOpFromToolArgs("list_harmony_presets", {})
    );
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_fit_notes_to_chords"),
  async execute({ timeline_id, ...args }) {
    const result = await getTimelineAgentHandler(timeline_id).applyOp(
      timelineOpFromToolArgs("fit_notes_to_chords", args)
    );
    return { ...result, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_close_gap"),
  async execute({ timeline_id, ...args }) {
    const result = await getTimelineAgentHandler(timeline_id).applyOp(
      timelineOpFromToolArgs("close_gap", args)
    );
    return { ...result, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_cut_transcript"),
  async execute({ timeline_id, ...args }) {
    const result = await getTimelineAgentHandler(timeline_id).applyOp(
      timelineOpFromToolArgs("cut_transcript", args)
    );
    return { ...result, url: docUrl("timeline", timeline_id) };
  }
});

// ── Step Sequencer (SQ48–SQ54) ──────────────────────────────────────────────

const STEP_SEQUENCER_SHARED_OPS = [
  "get_pattern",
  "create_pattern_region",
  "convert_pattern_to_midi",
  "convert_midi_to_pattern",
  "separate_pattern_rows",
  "set_pattern",
  "set_pattern_seed",
  "add_pattern_rows",
  "set_pattern_row",
  "remove_pattern_rows",
  "move_pattern_row",
  "sort_pattern_rows",
  "set_pattern_row_sort",
  "copy_pattern_row",
  "set_steps",
  "set_pattern_text",
  "clear_pattern",
  "copy_steps",
  "repeat_step",
  "rotate_pattern",
  "transpose_pattern",
  "randomize_pattern",
  "nudge_pattern_values",
  "tie_steps",
  "list_step_patterns",
  "apply_step_pattern",
  "save_step_pattern",
  "set_track_step_template",
  "create_step_pattern_folder",
  "rename_step_pattern_folder",
  "delete_step_pattern_folder",
  "move_step_pattern"
] as const;

for (const opName of STEP_SEQUENCER_SHARED_OPS) {
  FrontendToolRegistry.register({
    ...shared(`ui_timeline_${opName}`),
    async execute({ timeline_id, ...args }) {
      const result = await getTimelineAgentHandler(timeline_id).applyOp(
        timelineOpFromToolArgs(opName, args)
      );
      return { ...result, url: docUrl("timeline", timeline_id) };
    }
  });
}

// ── VST/AU Plug-in Hosting (VST1) ───────────────────────────────────────────

const PLUGIN_SHARED_OPS = [
  "list_plugins",
  "load_plugin",
  "list_plugin_presets",
  "select_plugin_preset",
  "get_plugin_parameters",
  "set_plugin_parameters"
] as const;

for (const opName of PLUGIN_SHARED_OPS) {
  FrontendToolRegistry.register({
    ...shared(`ui_timeline_${opName}`),
    async execute({ timeline_id, ...args }) {
      const result = await getTimelineAgentHandler(timeline_id).applyOp(
        timelineOpFromToolArgs(opName, args)
      );
      return { ...result, url: docUrl("timeline", timeline_id) };
    }
  });
}

FrontendToolRegistry.register({
  name: "ui_timeline_undo",
  description:
    "Undo the last edits on the specified timeline sequence, the same as Ctrl+Z in the editor, or redo them with `redo: true`. One agent tool call is one undo step, so `steps` counts tool calls. Edits the user made are on the same history, so read ui_timeline_get_state first when you are not sure what the last step was.",
  parameters: z.object({
    timeline_id: timelineIdParam,
    steps: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("How many steps to undo or redo. Default 1."),
    redo: z.boolean().optional().describe("Redo instead of undo.")
  }),
  async execute({ timeline_id, steps, redo }) {
    const result = await getTimelineAgentHandler(timeline_id).undo({
      steps: steps ?? 1,
      redo: redo ?? false
    });
    return { ok: true, ...result, url: docUrl("timeline", timeline_id) };
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
