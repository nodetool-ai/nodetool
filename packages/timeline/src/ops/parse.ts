import { z } from "zod";
import {
  uiToolParams,
  type UiToolContract
} from "@nodetool-ai/protocol/api-schemas/ui-tool-contract.js";
import {
  buildTimelineToolContracts,
  liftCustomAnimation
} from "@nodetool-ai/protocol/api-schemas/timeline-tool-contracts.js";
import {
  applyTransitionAtCutParams,
  setBakedAnimationParams,
  setGeneratedMatteParams,
  textStylePatchParams
} from "@nodetool-ai/protocol/api-schemas/timeline-tool-params.js";
import { STAGGER_UNITS, ANIMATED_PROPERTIES } from "../animation/index.js";
import { DEFAULT_BEAT_TOLERANCE_MS } from "../beats.js";
import type { TimelineOp, TimelineOpName } from "./op.js";

const contracts = buildTimelineToolContracts({
  staggerUnits: STAGGER_UNITS,
  animatedProperties: ANIMATED_PROPERTIES,
  beatToleranceMs: DEFAULT_BEAT_TOLERANCE_MS
});

function parseContract<S extends z.ZodRawShape>(
  contract: UiToolContract<S>,
  args: Record<string, unknown>
): z.infer<z.ZodObject<S>> {
  // Finalizers validate strict fields and remedies. The typed shape restores
  // the inferred fields erased by the finalizer's ZodType return type.
  return z.object(contract.shape).parse(uiToolParams(contract).parse(args));
}

type OpParser<N extends TimelineOpName> = (
  args: Record<string, unknown>
) => Extract<TimelineOp, { op: N }>;

/** One parser per op, so each is checked against its own op type. */
const OP_PARSERS: { [N in TimelineOpName]: OpParser<N> } = {
  add_midi_clip: (args) => ({
    op: "add_midi_clip",
    ...parseContract(contracts.ui_timeline_add_midi_clip, args)
  }),
  set_notes: (args) => ({
    op: "set_notes",
    ...parseContract(contracts.ui_timeline_set_notes, args)
  }),
  set_tempo: (args) => ({
    op: "set_tempo",
    ...parseContract(contracts.ui_timeline_set_tempo, args)
  }),
  set_track_instrument: (args) => ({
    op: "set_track_instrument",
    ...parseContract(contracts.ui_timeline_set_track_instrument, args)
  }),
  transpose_clip: (args) => ({
    op: "transpose_clip",
    ...parseContract(contracts.ui_timeline_transpose_clip, args)
  }),
  quantize_notes: (args) => ({
    op: "quantize_notes",
    ...parseContract(contracts.ui_timeline_quantize_notes, args)
  }),
  scale_velocity: (args) => ({
    op: "scale_velocity",
    ...parseContract(contracts.ui_timeline_scale_velocity, args)
  }),
  set_reframe_subject: (args) => ({
    op: "set_reframe_subject",
    ...parseContract(contracts.ui_timeline_set_reframe_subject, args)
  }),
  add_reframe_keyframe: (args) => ({
    op: "add_reframe_keyframe",
    ...parseContract(contracts.ui_timeline_add_reframe_keyframe, args)
  }),
  clear_reframe: (args) => ({
    op: "clear_reframe",
    ...parseContract(contracts.ui_timeline_clear_reframe, args)
  }),
  retarget_format: (args) => ({
    op: "retarget_format",
    ...parseContract(contracts.ui_timeline_retarget_format, args)
  }),
  stagger_animations: (args) => ({
    op: "stagger_animations",
    ...parseContract(contracts.ui_timeline_stagger_animations, args)
  }),
  set_setup: (args) => ({
    op: "set_setup",
    ...parseContract(contracts.ui_timeline_set_setup, args)
  }),
  plan_beats: (args) => ({
    op: "plan_beats",
    ...parseContract(contracts.ui_timeline_plan_beats, args)
  }),
  update_beat: (args) => ({
    op: "update_beat",
    ...parseContract(contracts.ui_timeline_update_beat, args)
  }),
  remove_beat: (args) => ({
    op: "remove_beat",
    ...parseContract(contracts.ui_timeline_remove_beat, args)
  }),
  generate_from_beats: (args) => ({
    op: "generate_from_beats",
    ...parseContract(contracts.ui_timeline_generate_from_beats, args)
  }),
  get_state: (args) => ({
    op: "get_state",
    ...parseContract(contracts.ui_timeline_get_state, args)
  }),
  add_track: (args) => ({
    op: "add_track",
    ...parseContract(contracts.ui_timeline_add_track, args)
  }),
  move_track: (args) => ({
    op: "move_track",
    ...parseContract(contracts.ui_timeline_move_track, args)
  }),
  delete_track: (args) => ({
    op: "delete_track",
    ...parseContract(contracts.ui_timeline_delete_track, args)
  }),
  add_media_clip: (args) => ({
    op: "add_media_clip",
    ...parseContract(contracts.ui_timeline_add_media_clip, args)
  }),
  add_model3d_clip: (args) => ({
    op: "add_model3d_clip",
    ...parseContract(contracts.ui_timeline_add_model3d_clip, args)
  }),
  set_model3d_style: (args) => ({
    op: "set_model3d_style",
    ...parseContract(contracts.ui_timeline_set_model3d_style, args)
  }),
  bake_model3d_clip: (args) => ({
    op: "bake_model3d_clip",
    ...parseContract(contracts.ui_timeline_bake_model3d_clip, args)
  }),
  add_group: (args) => ({
    op: "add_group",
    ...parseContract(contracts.ui_timeline_add_group, args)
  }),
  generate_clip: (args) => ({
    op: "generate_clip",
    ...parseContract(contracts.ui_timeline_generate_clip, args)
  }),
  split_clip: (args) => ({
    op: "split_clip",
    ...parseContract(contracts.ui_timeline_split_clip, args)
  }),
  trim_clip: (args) => ({
    op: "trim_clip",
    ...parseContract(contracts.ui_timeline_trim_clip, args)
  }),
  move_clip: (args) => ({
    op: "move_clip",
    ...parseContract(contracts.ui_timeline_move_clip, args)
  }),
  delete_clip: (args) => ({
    op: "delete_clip",
    ...parseContract(contracts.ui_timeline_delete_clip, args)
  }),
  duplicate_clip: (args) => ({
    op: "duplicate_clip",
    ...parseContract(contracts.ui_timeline_duplicate_clip, args)
  }),
  set_parent: (args) => ({
    op: "set_parent",
    ...parseContract(contracts.ui_timeline_set_parent, args)
  }),
  set_transition: (args) => ({
    op: "set_transition",
    ...parseContract(contracts.ui_timeline_set_transition, args)
  }),
  apply_transition_at_cut: (args) => ({
    op: "apply_transition_at_cut",
    ...applyTransitionAtCutParams.parse(args)
  }),
  set_mask: (args) => ({
    op: "set_mask",
    ...parseContract(contracts.ui_timeline_set_mask, args)
  }),
  set_matte: (args) => ({
    op: "set_matte",
    ...parseContract(contracts.ui_timeline_set_matte, args)
  }),
  set_generated_matte: (args) => ({
    op: "set_generated_matte",
    ...setGeneratedMatteParams.parse(args)
  }),
  set_time_remap: (args) => ({
    op: "set_time_remap",
    ...parseContract(contracts.ui_timeline_set_time_remap, args)
  }),
  set_effects: (args) => ({
    op: "set_effects",
    ...parseContract(contracts.ui_timeline_set_effects, args)
  }),
  set_clip_binding: (args) => ({
    op: "set_clip_binding",
    ...parseContract(contracts.ui_timeline_set_clip_binding, args)
  }),
  set_baked_animation: (args) => ({
    op: "set_baked_animation",
    ...setBakedAnimationParams.parse(args)
  }),
  clear_animations: (args) => ({
    op: "clear_animations",
    ...parseContract(contracts.ui_timeline_clear_animations, args)
  }),
  list_animation_presets: (args) => ({
    op: "list_animation_presets",
    ...parseContract(contracts.ui_timeline_list_animation_presets, args)
  }),
  list_instruments: (args) => ({
    op: "list_instruments",
    ...parseContract(contracts.ui_timeline_list_instruments, args)
  }),
  select_clip: (args) => ({
    op: "select_clip",
    ...parseContract(contracts.ui_timeline_select_clip, args)
  }),
  seek: (args) => ({
    op: "seek",
    ...parseContract(contracts.ui_timeline_seek, args)
  }),
  add_marker: (args) => ({
    op: "add_marker",
    ...parseContract(contracts.ui_timeline_add_marker, args)
  }),
  delete_marker: (args) => ({
    op: "delete_marker",
    ...parseContract(contracts.ui_timeline_delete_marker, args)
  }),
  set_markers_from_beats: (args) => ({
    op: "set_markers_from_beats",
    ...parseContract(contracts.ui_timeline_set_markers_from_beats, args)
  }),
  snap_to_beats: (args) => ({
    op: "snap_to_beats",
    ...parseContract(contracts.ui_timeline_snap_to_beats, args)
  }),
  list_takes: (args) => ({
    op: "list_takes",
    ...z.object({ target: z.string() }).parse(args)
  }),
  select_take: (args) => ({
    op: "select_take",
    ...z.object({ target: z.string(), takeId: z.string() }).parse(args)
  }),
  rename_take: (args) => ({
    op: "rename_take",
    ...z
      .object({ target: z.string(), takeId: z.string(), label: z.string() })
      .parse(args)
  }),
  delete_take: (args) => ({
    op: "delete_take",
    ...z.object({ target: z.string(), takeId: z.string() }).parse(args)
  }),
  list_tracks: (args) => ({
    op: "list_tracks",
    ...z.object({ target: z.string().optional() }).parse(args)
  }),
  delete_track_object: (args) => ({
    op: "delete_track_object",
    ...z.object({ trackId: z.string() }).parse(args)
  }),
  bind_to_track: (args) => ({
    op: "bind_to_track",
    ...z
      .object({
        target: z.string(),
        trackId: z.string(),
        mode: z.enum([
          "position",
          "position_scale",
          "transform",
          "mask",
          "effect_region",
          "reframe"
        ]),
        offset: z.object({ x: z.number(), y: z.number() }).optional(),
        scale: z.number().optional(),
        rotationOffset: z.number().optional(),
        smoothing: z.number().optional()
      })
      .parse(args)
  }),
  unbind_track: (args) => ({
    op: "unbind_track",
    ...z.object({ target: z.string() }).parse(args)
  }),
  insert_composition: (args) => ({
    op: "insert_composition",
    ...z
      .object({
        composition_id: z.string(),
        startMs: z.number(),
        trackId: z.string().optional(),
        params: z
          .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
          .optional()
      })
      .parse(args)
  }),
  add_text_clip: (args) => {
    const parsed = parseContract(contracts.ui_timeline_add_text_clip, args);
    const {
      text,
      style,
      name: clipName,
      trackId,
      startMs,
      durationMs,
      opacity,
      transform,
      ...loose
    } = parsed;
    return {
      op: "add_text_clip",
      text,
      style,
      name: clipName,
      trackId,
      startMs,
      durationMs,
      opacity,
      transform,
      loose
    };
  },
  add_shape_clip: (args) => {
    const parsed = parseContract(contracts.ui_timeline_add_shape_clip, args);
    const {
      shape,
      shapeStyle,
      name: clipName,
      trackId,
      startMs,
      durationMs,
      opacity,
      transform,
      ...loose
    } = parsed;
    return {
      op: "add_shape_clip",
      shape,
      shapeStyle,
      name: clipName,
      trackId,
      startMs,
      durationMs,
      opacity,
      transform,
      loose
    };
  },
  set_clip_params: (args) => {
    const { target, ...patch } = z
      .object({
        ...contracts.ui_timeline_set_clip_params.shape,
        textStyle: textStylePatchParams.optional()
      })
      .passthrough()
      .parse(unwrapClipParams(args));
    return { op: "set_clip_params", target, patch };
  },
  animate_clip: (args) => {
    const parsed = parseContract(contracts.ui_timeline_animate_clip, args);
    return {
      ...parsed,
      op: "animate_clip",
      animations: parsed.animations.map(liftCustomAnimation)
    };
  }
};

/** Parse tool arguments once at the shared edit boundary. */
export function timelineOpFromToolArgs(
  name: TimelineOpName,
  args: Record<string, unknown>
): TimelineOp {
  return OP_PARSERS[name](args);
}

/** Accept the patch wrappers used by REST-shaped callers. */
export function unwrapClipParams(
  patch: Record<string, unknown>
): Record<string, unknown> {
  for (const key of ["params", "patch", "props", "properties"]) {
    const nested = patch[key];
    if (
      typeof nested === "object" &&
      nested !== null &&
      !Array.isArray(nested)
    ) {
      const { [key]: ignored, ...rest } = patch;
      return { ...nested, ...rest };
    }
  }
  return patch;
}
