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

/** Parse tool arguments once at the shared edit boundary. */
export function timelineOpFromToolArgs(
  name: TimelineOpName,
  args: Record<string, unknown>
): TimelineOp {
  switch (name) {
    case "add_midi_clip":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_add_midi_clip, args)
      };
    case "set_notes":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_set_notes, args)
      };
    case "set_tempo":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_set_tempo, args)
      };
    case "set_track_instrument":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_set_track_instrument, args)
      };
    case "transpose_clip":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_transpose_clip, args)
      };
    case "quantize_notes":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_quantize_notes, args)
      };
    case "scale_velocity":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_scale_velocity, args)
      };
    case "set_reframe_subject":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_set_reframe_subject, args)
      };
    case "add_reframe_keyframe":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_add_reframe_keyframe, args)
      };
    case "clear_reframe":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_clear_reframe, args)
      };
    case "retarget_format":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_retarget_format, args)
      };
    case "stagger_animations":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_stagger_animations, args)
      };
    case "set_setup":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_set_setup, args)
      };
    case "plan_beats":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_plan_beats, args)
      };
    case "update_beat":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_update_beat, args)
      };
    case "remove_beat":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_remove_beat, args)
      };
    case "generate_from_beats":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_generate_from_beats, args)
      };
    case "get_state":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_get_state, args)
      };
    case "add_track":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_add_track, args)
      };
    case "move_track":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_move_track, args)
      };
    case "delete_track":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_delete_track, args)
      };
    case "add_media_clip":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_add_media_clip, args)
      };
    case "add_model3d_clip":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_add_model3d_clip, args)
      };
    case "set_model3d_style":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_set_model3d_style, args)
      };
    case "bake_model3d_clip":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_bake_model3d_clip, args)
      };
    case "add_group":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_add_group, args)
      };
    case "generate_clip":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_generate_clip, args)
      };
    case "split_clip":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_split_clip, args)
      };
    case "trim_clip":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_trim_clip, args)
      };
    case "move_clip":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_move_clip, args)
      };
    case "delete_clip":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_delete_clip, args)
      };
    case "duplicate_clip":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_duplicate_clip, args)
      };
    case "set_parent":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_set_parent, args)
      };
    case "set_transition":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_set_transition, args)
      };
    case "apply_transition_at_cut":
      return { op: name, ...applyTransitionAtCutParams.parse(args) };
    case "set_mask":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_set_mask, args)
      };
    case "set_matte":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_set_matte, args)
      };
    case "set_generated_matte":
      return { op: name, ...setGeneratedMatteParams.parse(args) };
    case "set_time_remap":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_set_time_remap, args)
      };
    case "set_effects":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_set_effects, args)
      };
    case "set_clip_binding":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_set_clip_binding, args)
      };
    case "set_baked_animation":
      return { op: name, ...setBakedAnimationParams.parse(args) };
    case "clear_animations":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_clear_animations, args)
      };
    case "list_animation_presets":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_list_animation_presets, args)
      };
    case "select_clip":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_select_clip, args)
      };
    case "seek":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_seek, args)
      };
    case "add_marker":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_add_marker, args)
      };
    case "delete_marker":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_delete_marker, args)
      };
    case "set_markers_from_beats":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_set_markers_from_beats, args)
      };
    case "snap_to_beats":
      return {
        op: name,
        ...parseContract(contracts.ui_timeline_snap_to_beats, args)
      };
    case "list_takes":
      return { op: name, ...z.object({ target: z.string() }).parse(args) };
    case "select_take":
      return {
        op: name,
        ...z.object({ target: z.string(), takeId: z.string() }).parse(args)
      };
    case "rename_take":
      return {
        op: name,
        ...z
          .object({ target: z.string(), takeId: z.string(), label: z.string() })
          .parse(args)
      };
    case "delete_take":
      return {
        op: name,
        ...z.object({ target: z.string(), takeId: z.string() }).parse(args)
      };
    case "list_tracks":
      return {
        op: name,
        ...z.object({ target: z.string().optional() }).parse(args)
      };
    case "delete_track_object":
      return { op: name, ...z.object({ trackId: z.string() }).parse(args) };
    case "bind_to_track":
      return {
        op: name,
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
      };
    case "unbind_track":
      return { op: name, ...z.object({ target: z.string() }).parse(args) };
    case "insert_composition":
      return {
        op: name,
        ...z
          .object({
            composition_id: z.string(),
            startMs: z.number(),
            trackId: z.string().optional(),
            params: z
              .record(
                z.string(),
                z.union([z.string(), z.number(), z.boolean()])
              )
              .optional()
          })
          .parse(args)
      };
    case "add_text_clip": {
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
        op: name,
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
    }
    case "add_shape_clip": {
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
        op: name,
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
    }
    case "set_clip_params": {
      const { target, ...patch } = z
        .object({
          ...contracts.ui_timeline_set_clip_params.shape,
          textStyle: textStylePatchParams.optional()
        })
        .passthrough()
        .parse(unwrapClipParams(args));
      return { op: name, target, patch };
    }
    case "animate_clip": {
      const parsed = parseContract(contracts.ui_timeline_animate_clip, args);
      return {
        ...parsed,
        op: name,
        animations: parsed.animations.map(liftCustomAnimation)
      };
    }
  }
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
