/**
 * The op union `applyTimelineOp` dispatches on.
 *
 * One member per `ui_timeline_*` tool, named without the prefix. Each host
 * parses a call with its own Zod schema (the shared shapes live in
 * `@nodetool-ai/protocol/api-schemas/timeline-tool-params`) and hands the
 * parsed arguments over as one of these; the field names are the schemas'.
 */

import type {
  AddGroupParams,
  EffectParams,
  MaskParams,
  MatteParams,
  SetParentParams,
  TimeRemapParams,
  TransitionParams
} from "@nodetool-ai/protocol/api-schemas/timeline-tool-params.js";
import type { TimelineClip, TimelineTrack } from "../types.js";
import type { ClipAnimation } from "../animation/types.js";
import type { TimelineAnimationInput } from "./types.js";

type TextStyleInput = NonNullable<TimelineClip["textStyle"]>;
type ShapeStyleInput = NonNullable<TimelineClip["shapeStyle"]>;
type CaptionStyleInput = NonNullable<
  NonNullable<TimelineClip["caption"]>["style"]
>;

export interface GetStateOp {
  op: "get_state";
}

export interface AddTrackOp {
  op: "add_track";
  type: TimelineTrack["type"];
  name?: string;
}

export interface MoveTrackOp {
  op: "move_track";
  target?: string;
  trackId?: string;
  toIndex?: number;
  index?: number;
  before?: string;
  after?: string;
}

export interface DeleteTrackOp {
  op: "delete_track";
  target?: string;
  trackId?: string;
  deleteClips?: boolean;
}

export interface AddTextClipOp {
  op: "add_text_clip";
  text: string;
  trackId?: string;
  startMs?: number;
  durationMs?: number;
  opacity?: number;
  style?: Partial<TextStyleInput>;
  /** Style fields sent at the top level instead of under `style`. */
  loose?: Partial<TextStyleInput>;
}

export interface AddMediaClipOp {
  op: "add_media_clip";
  asset: string;
  trackId?: string;
  startMs?: number;
  durationMs?: number;
  name?: string;
}

export interface AddShapeClipOp {
  op: "add_shape_clip";
  shape?: unknown;
  shapeStyle?: unknown;
  trackId?: string;
  startMs?: number;
  durationMs?: number;
  opacity?: number;
  loose?: Record<string, unknown>;
}

export type AddGroupOp = { op: "add_group" } & AddGroupParams;

export interface GenerateClipOp {
  op: "generate_clip";
  kind: "text-to-video" | "text-to-image" | "text-to-audio";
  prompt: string;
  trackId?: string;
  startMs?: number;
  durationMs?: number;
  provider?: string;
  model?: string;
  voice?: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
  resolution?: string;
  autoGenerate?: boolean;
}

export interface SplitClipOp {
  op: "split_clip";
  target: string;
  atMs?: number;
}

export interface TrimClipOp {
  op: "trim_clip";
  target: string;
  durationMs?: number;
  inPointMs?: number;
  outPointMs?: number;
}

export interface MoveClipOp {
  op: "move_clip";
  target: string;
  startMs?: number;
  trackId?: string;
}

export interface DeleteClipOp {
  op: "delete_clip";
  target: string;
}

export interface DuplicateClipOp {
  op: "duplicate_clip";
  target: string;
  gapMs?: number;
}

/** Every key `set_clip_params` accepts, plus the unknown ones it refuses. */
export interface SetClipParamsOp {
  op: "set_clip_params";
  target: string;
  patch: Record<string, unknown> & {
    startMs?: number;
    trackId?: string;
    durationMs?: number;
    inPointMs?: number;
    outPointMs?: number;
    fontSizePx?: number;
    name?: string;
    opacity?: number;
    speedMultiplier?: number;
    volumeDb?: number;
    fadeInMs?: number;
    fadeOutMs?: number;
    blendMode?: string;
    borderRadius?: number;
    hidden?: boolean;
    muted?: boolean;
    locked?: boolean;
    textStyle?: TextStyleInput;
    shapeStyle?: ShapeStyleInput;
    captionStyle?: CaptionStyleInput;
  };
}

export type SetParentOp = { op: "set_parent" } & SetParentParams;

export interface SetTransitionOp {
  op: "set_transition";
  target: string;
  transition: TransitionParams | null;
}

export interface SetMaskOp {
  op: "set_mask";
  target: string;
  mask: MaskParams | null;
}

export interface SetMatteOp {
  op: "set_matte";
  target: string;
  matte: MatteParams | null;
}

export interface SetTimeRemapOp {
  op: "set_time_remap";
  target: string;
  timeRemap: TimeRemapParams | null;
}

export interface SetEffectsOp {
  op: "set_effects";
  target: string;
  effects: EffectParams[];
}

export interface SetClipBindingOp {
  op: "set_clip_binding";
  target: string;
  prompt?: string;
  negativePrompt?: string;
  provider?: string;
  model?: string;
  voice?: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
  resolution?: string;
  strength?: number;
  numInferenceSteps?: number;
  regenerate?: boolean;
}

export interface AnimateClipOp {
  op: "animate_clip";
  target: string;
  mode?: "add" | "replace";
  animations: TimelineAnimationInput[];
}

export interface ClearAnimationsOp {
  op: "clear_animations";
  target: string;
  role?: ClipAnimation["role"];
}

export interface ListAnimationPresetsOp {
  op: "list_animation_presets";
}

export interface SelectClipOp {
  op: "select_clip";
  target?: string | null;
}

export interface SeekOp {
  op: "seek";
  timeMs: number;
}

export interface AddMarkerOp {
  op: "add_marker";
  timeMs: number;
  label?: string;
  color?: string;
  note?: string;
}

export interface DeleteMarkerOp {
  op: "delete_marker";
  target: string;
}

export interface SetMarkersFromBeatsOp {
  op: "set_markers_from_beats";
  onsets_ms?: number[];
  bpm?: number;
  offset_ms?: number;
  count?: number;
  label?: string;
}

export interface SnapToBeatsOp {
  op: "snap_to_beats";
  targets?: string[] | "all";
  onsets_ms?: number[];
  bpm?: number;
  offset_ms?: number;
  tolerance_ms?: number;
  mode?: "start" | "end" | "both";
  action?: "move" | "trim";
}

export interface InsertCompositionOp {
  op: "insert_composition";
  composition_id: string;
  startMs: number;
  trackId?: string;
  params?: Record<string, string | number | boolean>;
}

export type TimelineOp =
  | GetStateOp
  | AddTrackOp
  | MoveTrackOp
  | DeleteTrackOp
  | AddTextClipOp
  | AddMediaClipOp
  | AddShapeClipOp
  | AddGroupOp
  | GenerateClipOp
  | SplitClipOp
  | TrimClipOp
  | MoveClipOp
  | DeleteClipOp
  | DuplicateClipOp
  | SetClipParamsOp
  | SetParentOp
  | SetTransitionOp
  | SetMaskOp
  | SetMatteOp
  | SetTimeRemapOp
  | SetEffectsOp
  | SetClipBindingOp
  | AnimateClipOp
  | ClearAnimationsOp
  | ListAnimationPresetsOp
  | SelectClipOp
  | SeekOp
  | AddMarkerOp
  | DeleteMarkerOp
  | SetMarkersFromBeatsOp
  | SnapToBeatsOp
  | InsertCompositionOp;

export type TimelineOpName = TimelineOp["op"];

/**
 * Every op `applyTimelineOp` handles. `get_clip_frames` is absent on purpose:
 * it samples rendered video and has no document mutation to share.
 */
export const TIMELINE_OP_NAMES = [
  "get_state",
  "add_track",
  "move_track",
  "delete_track",
  "add_text_clip",
  "add_media_clip",
  "add_shape_clip",
  "add_group",
  "generate_clip",
  "split_clip",
  "trim_clip",
  "move_clip",
  "delete_clip",
  "duplicate_clip",
  "set_clip_params",
  "set_parent",
  "set_transition",
  "set_mask",
  "set_matte",
  "set_time_remap",
  "set_effects",
  "set_clip_binding",
  "animate_clip",
  "clear_animations",
  "list_animation_presets",
  "select_clip",
  "seek",
  "add_marker",
  "delete_marker",
  "set_markers_from_beats",
  "snap_to_beats",
  "insert_composition"
] as const satisfies readonly TimelineOpName[];
