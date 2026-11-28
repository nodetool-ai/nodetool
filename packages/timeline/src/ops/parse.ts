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
  automationEditSchemas,
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
  "automation.addPoints": (args) => {
    if (Object.hasOwn(args, "edit")) {
      throw new Error("Unexpected edit parameter.");
    }
    const { track_id, ...payload } = args;
    const { edit: _edit, ...parsed } = automationEditSchemas[
      "automation.addPoints"
    ].parse({
      ...payload,
      edit: "automation.addPoints"
    });
    return {
      op: "automation.addPoints",
      track_id: z.string().min(1).parse(track_id),
      ...parsed
    };
  },
  "automation.movePoints": (args) => {
    if (Object.hasOwn(args, "edit")) {
      throw new Error("Unexpected edit parameter.");
    }
    const { track_id, ...payload } = args;
    const { edit: _edit, ...parsed } = automationEditSchemas[
      "automation.movePoints"
    ].parse({
      ...payload,
      edit: "automation.movePoints"
    });
    return {
      op: "automation.movePoints",
      track_id: z.string().min(1).parse(track_id),
      ...parsed
    };
  },
  "automation.deletePoints": (args) => {
    if (Object.hasOwn(args, "edit")) {
      throw new Error("Unexpected edit parameter.");
    }
    const { track_id, ...payload } = args;
    const { edit: _edit, ...parsed } = automationEditSchemas[
      "automation.deletePoints"
    ].parse({
      ...payload,
      edit: "automation.deletePoints"
    });
    return {
      op: "automation.deletePoints",
      track_id: z.string().min(1).parse(track_id),
      ...parsed
    };
  },
  "automation.clearLane": (args) => {
    if (Object.hasOwn(args, "edit")) {
      throw new Error("Unexpected edit parameter.");
    }
    const { track_id, ...payload } = args;
    const { edit: _edit, ...parsed } = automationEditSchemas[
      "automation.clearLane"
    ].parse({
      ...payload,
      edit: "automation.clearLane"
    });
    return {
      op: "automation.clearLane",
      track_id: z.string().min(1).parse(track_id),
      ...parsed
    };
  },
  "automation.setLaneEnabled": (args) => {
    if (Object.hasOwn(args, "edit")) {
      throw new Error("Unexpected edit parameter.");
    }
    const { track_id, ...payload } = args;
    const { edit: _edit, ...parsed } = automationEditSchemas[
      "automation.setLaneEnabled"
    ].parse({
      ...payload,
      edit: "automation.setLaneEnabled"
    });
    return {
      op: "automation.setLaneEnabled",
      track_id: z.string().min(1).parse(track_id),
      ...parsed
    };
  },
  setTrackAutomationMode: (args) => {
    if (Object.hasOwn(args, "edit")) {
      throw new Error("Unexpected edit parameter.");
    }
    const { track_id, ...payload } = args;
    const { edit: _edit, ...parsed } = automationEditSchemas[
      "setTrackAutomationMode"
    ].parse({
      ...payload,
      edit: "setTrackAutomationMode"
    });
    return {
      op: "setTrackAutomationMode",
      track_id: z.string().min(1).parse(track_id),
      ...parsed
    };
  },

  add_midi_clip: (args) => ({
    op: "add_midi_clip",
    ...parseContract(contracts.ui_timeline_add_midi_clip, args)
  }),
  set_notes: (args) => ({
    op: "set_notes",
    ...parseContract(contracts.ui_timeline_set_notes, args)
  }),
  set_track: (args) => ({
    op: "set_track",
    ...parseContract(contracts.ui_timeline_set_track, args)
  }),
  ripple_delete: (args) => ({
    op: "ripple_delete",
    ...parseContract(contracts.ui_timeline_ripple_delete, args)
  }),
  close_gap: (args) => ({
    op: "close_gap",
    ...parseContract(contracts.ui_timeline_close_gap, args)
  }),
  cut_transcript: (args) => ({
    op: "cut_transcript",
    ...parseContract(contracts.ui_timeline_cut_transcript, args)
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
  set_chords: (args) => ({
    op: "set_chords",
    ...parseContract(contracts.ui_timeline_set_chords, args)
  }),
  loop_clip: (args) => ({
    op: "loop_clip",
    ...parseContract(contracts.ui_timeline_loop_clip, args)
  }),
  join_clips: (args) => ({
    op: "join_clips",
    ...parseContract(contracts.ui_timeline_join_clips, args)
  }),
  insert_time: (args) => ({
    op: "insert_time",
    ...parseContract(contracts.ui_timeline_insert_time, args)
  }),
  delete_time: (args) => ({
    op: "delete_time",
    ...parseContract(contracts.ui_timeline_delete_time, args)
  }),
  duplicate_range: (args) => ({
    op: "duplicate_range",
    ...parseContract(contracts.ui_timeline_duplicate_range, args)
  }),
  paste_range: (args) => ({
    op: "paste_range",
    ...parseContract(contracts.ui_timeline_paste_range, args)
  }),
  clear_chords: (args) => ({
    op: "clear_chords",
    ...parseContract(contracts.ui_timeline_clear_chords, args)
  }),
  list_progressions: (args) => ({
    op: "list_progressions",
    ...parseContract(contracts.ui_timeline_list_progressions, args)
  }),
  apply_progression: (args) => ({
    op: "apply_progression",
    ...parseContract(contracts.ui_timeline_apply_progression, args)
  }),
  transpose_chords: (args) => ({
    op: "transpose_chords",
    ...parseContract(contracts.ui_timeline_transpose_chords, args)
  }),
  detect_chords: (args) => ({
    op: "detect_chords",
    ...parseContract(contracts.ui_timeline_detect_chords, args)
  }),
  set_clip_harmony: (args) => ({
    op: "set_clip_harmony",
    ...parseContract(contracts.ui_timeline_set_clip_harmony, args)
  }),
  list_harmony_presets: (args) => ({
    op: "list_harmony_presets",
    ...parseContract(contracts.ui_timeline_list_harmony_presets, args)
  }),
  fit_notes_to_chords: (args) => ({
    op: "fit_notes_to_chords",
    ...parseContract(contracts.ui_timeline_fit_notes_to_chords, args)
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
  apply_model3d_camera_move: (args) => ({
    op: "apply_model3d_camera_move",
    ...parseContract(contracts.ui_timeline_apply_model3d_camera_move, args)
  }),
  bake_model3d_clip: (args) => ({
    op: "bake_model3d_clip",
    ...parseContract(contracts.ui_timeline_bake_model3d_clip, args)
  }),
  render_model3d_reference: (args) => ({
    op: "render_model3d_reference",
    ...parseContract(contracts.ui_timeline_render_model3d_reference, args)
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
    const { target, maxSourceDurationMs, ...patch } = z
      .object({
        ...contracts.ui_timeline_set_clip_params.shape,
        textStyle: textStylePatchParams.optional()
      })
      .passthrough()
      .parse(unwrapClipParams(args));
    return maxSourceDurationMs !== undefined
      ? { op: "set_clip_params", target, maxSourceDurationMs, patch }
      : { op: "set_clip_params", target, patch };
  },
  animate_clip: (args) => {
    const parsed = parseContract(contracts.ui_timeline_animate_clip, args);
    return {
      ...parsed,
      op: "animate_clip",
      animations: parsed.animations.map(liftCustomAnimation)
    };
  },
  get_pattern: (args) => ({
    op: "get_pattern",
    ...parseContract(contracts.ui_timeline_get_pattern, args)
  }),
  create_pattern_region: (args) => ({
    op: "create_pattern_region",
    ...parseContract(contracts.ui_timeline_create_pattern_region, args)
  }),
  convert_pattern_to_midi: (args) => ({
    op: "convert_pattern_to_midi",
    ...parseContract(contracts.ui_timeline_convert_pattern_to_midi, args)
  }),
  convert_midi_to_pattern: (args) => ({
    op: "convert_midi_to_pattern",
    ...parseContract(contracts.ui_timeline_convert_midi_to_pattern, args)
  }),
  separate_pattern_rows: (args) => ({
    op: "separate_pattern_rows",
    ...parseContract(contracts.ui_timeline_separate_pattern_rows, args)
  }),
  set_pattern: (args) => ({
    op: "set_pattern",
    ...parseContract(contracts.ui_timeline_set_pattern, args)
  }),
  set_pattern_seed: (args) => ({
    op: "set_pattern_seed",
    ...parseContract(contracts.ui_timeline_set_pattern_seed, args)
  }),
  add_pattern_rows: (args) => ({
    op: "add_pattern_rows",
    ...parseContract(contracts.ui_timeline_add_pattern_rows, args)
  }),
  set_pattern_row: (args) => ({
    op: "set_pattern_row",
    ...parseContract(contracts.ui_timeline_set_pattern_row, args)
  }),
  remove_pattern_rows: (args) => ({
    op: "remove_pattern_rows",
    ...parseContract(contracts.ui_timeline_remove_pattern_rows, args)
  }),
  move_pattern_row: (args) => ({
    op: "move_pattern_row",
    ...parseContract(contracts.ui_timeline_move_pattern_row, args)
  }),
  sort_pattern_rows: (args) => ({
    op: "sort_pattern_rows",
    ...parseContract(contracts.ui_timeline_sort_pattern_rows, args)
  }),
  set_pattern_row_sort: (args) => ({
    op: "set_pattern_row_sort",
    ...parseContract(contracts.ui_timeline_set_pattern_row_sort, args)
  }),
  copy_pattern_row: (args) => ({
    op: "copy_pattern_row",
    ...parseContract(contracts.ui_timeline_copy_pattern_row, args)
  }),
  set_steps: (args) => ({
    op: "set_steps",
    ...parseContract(contracts.ui_timeline_set_steps, args)
  }),
  set_pattern_text: (args) => ({
    op: "set_pattern_text",
    ...parseContract(contracts.ui_timeline_set_pattern_text, args)
  }),
  clear_pattern: (args) => ({
    op: "clear_pattern",
    ...parseContract(contracts.ui_timeline_clear_pattern, args)
  }),
  copy_steps: (args) => ({
    op: "copy_steps",
    ...parseContract(contracts.ui_timeline_copy_steps, args)
  }),
  repeat_step: (args) => ({
    op: "repeat_step",
    ...parseContract(contracts.ui_timeline_repeat_step, args)
  }),
  rotate_pattern: (args) => ({
    op: "rotate_pattern",
    ...parseContract(contracts.ui_timeline_rotate_pattern, args)
  }),
  transpose_pattern: (args) => ({
    op: "transpose_pattern",
    ...parseContract(contracts.ui_timeline_transpose_pattern, args)
  }),
  randomize_pattern: (args) => ({
    op: "randomize_pattern",
    ...parseContract(contracts.ui_timeline_randomize_pattern, args)
  }),
  nudge_pattern_values: (args) => ({
    op: "nudge_pattern_values",
    ...parseContract(contracts.ui_timeline_nudge_pattern_values, args)
  }),
  tie_steps: (args) => ({
    op: "tie_steps",
    ...parseContract(contracts.ui_timeline_tie_steps, args)
  }),
  list_step_patterns: (args) => ({
    op: "list_step_patterns",
    ...parseContract(contracts.ui_timeline_list_step_patterns, args)
  }),
  apply_step_pattern: (args) => ({
    op: "apply_step_pattern",
    ...parseContract(contracts.ui_timeline_apply_step_pattern, args)
  }),
  save_step_pattern: (args) => ({
    op: "save_step_pattern",
    ...parseContract(contracts.ui_timeline_save_step_pattern, args)
  }),
  set_track_step_template: (args) => ({
    op: "set_track_step_template",
    ...parseContract(contracts.ui_timeline_set_track_step_template, args)
  }),
  create_step_pattern_folder: (args) => ({
    op: "create_step_pattern_folder",
    ...parseContract(contracts.ui_timeline_create_step_pattern_folder, args)
  }),
  rename_step_pattern_folder: (args) => ({
    op: "rename_step_pattern_folder",
    ...parseContract(contracts.ui_timeline_rename_step_pattern_folder, args)
  }),
  delete_step_pattern_folder: (args) => ({
    op: "delete_step_pattern_folder",
    ...parseContract(contracts.ui_timeline_delete_step_pattern_folder, args)
  }),
  move_step_pattern: (args) => ({
    op: "move_step_pattern",
    ...parseContract(contracts.ui_timeline_move_step_pattern, args)
  }),
  list_plugins: (args) => ({
    op: "list_plugins",
    ...parseContract(contracts.ui_timeline_list_plugins, args)
  }),
  load_plugin: (args) => ({
    op: "load_plugin",
    ...parseContract(contracts.ui_timeline_load_plugin, args)
  }),
  list_plugin_presets: (args) => ({
    op: "list_plugin_presets",
    ...parseContract(contracts.ui_timeline_list_plugin_presets, args)
  }),
  select_plugin_preset: (args) => ({
    op: "select_plugin_preset",
    ...parseContract(contracts.ui_timeline_select_plugin_preset, args)
  }),
  get_plugin_parameters: (args) => ({
    op: "get_plugin_parameters",
    ...parseContract(contracts.ui_timeline_get_plugin_parameters, args)
  }),
  set_plugin_parameters: (args) => ({
    op: "set_plugin_parameters",
    ...parseContract(contracts.ui_timeline_set_plugin_parameters, args)
  })
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
