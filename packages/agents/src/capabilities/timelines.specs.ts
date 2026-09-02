/**
 * The `timelines` module's specs — data only, no implementation.
 *
 * Split out so a belt can be assembled synchronously: the registry's eager
 * spec table imports this file, never `timelines.ts`, so nothing the
 * implementations pull in reaches the entry graph. `timelines.ts` imports these
 * back and attaches each to its implementation, so there is one spec object
 * behind both halves.
 */

import type { CapabilitySpec } from "./types.js";
import type { JsonSchema } from "@nodetool-ai/runtime";
import { isString } from "../utils/type-guards.js";

export const DEFAULT_VERSION_LIMIT = 20;

export const MAX_VERSION_LIMIT = 100;

export const SAVE_TYPE_PROPERTY = {
  type: "string" as const,
  enum: ["manual", "autosave", "restore"],
  description:
    "Only versions of this kind: 'manual' (a save someone asked for), " +
    "'autosave' (taken on a document write), 'restore' (the pre-restore " +
    "snapshot). Omit for all of them."
};

export const LIST_TIMELINES_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description:
        "Only timelines whose name contains this text (case-insensitive)."
    },
    limit: {
      type: "number",
      description: "Max timelines to return (default 20)."
    }
  }
};

export const GET_TIMELINE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    timeline_id: {
      type: "string",
      description: "Timeline sequence id (from list_timelines)."
    }
  },
  required: ["timeline_id"]
};

export const LIST_TIMELINE_VERSIONS_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    timeline_id: {
      type: "string",
      description: "Timeline sequence id."
    },
    save_type: SAVE_TYPE_PROPERTY,
    limit: {
      type: "number",
      description: `Max versions to return (default ${DEFAULT_VERSION_LIMIT}, max ${MAX_VERSION_LIMIT}).`
    }
  },
  required: ["timeline_id"]
};

export const GET_TIMELINE_VERSION_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    timeline_id: {
      type: "string",
      description: "Timeline sequence id."
    },
    version: {
      type: "number",
      description: "Version number to read, from list_timeline_versions."
    }
  },
  required: ["timeline_id", "version"]
};

export const CREATE_TIMELINE_VERSION_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    timeline_id: {
      type: "string",
      description: "Timeline sequence id."
    },
    name: {
      type: "string",
      description: "Label for the snapshot, e.g. 'before the recut'."
    }
  },
  required: ["timeline_id"]
};

export const RESTORE_TIMELINE_VERSION_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    timeline_id: {
      type: "string",
      description: "Timeline sequence id."
    },
    version: {
      type: "number",
      description: "Version number to restore, from list_timeline_versions."
    }
  },
  required: ["timeline_id", "version"]
};

export const EDIT_TIMELINE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    timeline_id: { type: "string", description: "Timeline sequence id." },
    ops: {
      type: "array",
      description:
        'Operations in order. Each is {"op": <name>, ...arguments}, e.g. ' +
        '{"op": "add_track", "type": "audio", "name": "Music"} or ' +
        '{"op": "animate_clip", "target": "Title", "animations": [{"role": "in", "preset": "fade"}]}. ' +
        "Ops: get_state, add_track, add_media_clip, add_text_clip, add_shape_clip, " +
        "add_group, split_clip, trim_clip, move_clip, duplicate_clip, delete_clip, " +
        "set_clip_params, set_parent, set_clip_binding, set_transition, set_mask, " +
        "set_matte, set_time_remap, set_effects, animate_clip, " +
        "clear_animations, list_animation_presets, select_clip, seek, " +
        "add_marker, delete_marker, set_markers_from_beats, snap_to_beats, " +
        "insert_composition. " +
        "Start with get_state to " +
        "read track and clip ids. To lay existing videos end to end, call " +
        'add_media_clip once per asset ({"op": "add_media_clip", "asset": ' +
        '"asset://<id>.mp4"}) — each appends after the last. animate_clip ' +
        'takes catalog presets and, for motion none of them covers, ' +
        '{"preset": "custom"} with exactly one of `curves` ' +
        '([{property, keyframes: [{t, value, easing?}]}], `t` running 0..1 ' +
        "over the animation's window) or `code` (a JS body baked into curves " +
        "once, host-side); add `mask` when a curve drives wipeProgress. " +
        "list_animation_presets reports the animatable properties. " +
        'set_transition takes {"target", "transition": {type, durationMs, ' +
        "easing?, color?, direction?, softness?} | null} — the cut plays over " +
        "the target's head against the clip beneath it, so overlap the two. " +
        'set_mask takes {"target", "mask": {kind: "rect"|"ellipse"|"path", ' +
        "x?, y?, width?, height?, d?, featherPx?, invert?} | null} in the " +
        "clip's own 0..1 space. " +
        'set_matte takes {"target", "matte": {source, mode: "alpha"|"luma", ' +
        "invert?} | null}; the source clip stops drawing itself and its alpha " +
        "or brightness becomes the target's transparency. " +
        'set_time_remap takes {"target", "timeRemap": {keyframes: [{t, ' +
        "sourceMs, easing?}]} | null}; `t` runs 0..1 over the clip's window " +
        "and must start at 0, end at 1 and ascend, while `sourceMs` says " +
        "which millisecond of the source plays there — descending is reverse, " +
        "a flat pair is a freeze. It replaces the clip's rate, and split and " +
        "trim refuse a remapped clip. " +
        'add_group takes {"name", "startMs", "durationMs", trackId?, ' +
        'children?: [clip, ...]} and creates a clip with no media whose ' +
        "transform, opacity and window every clip naming it inherits — move " +
        "the group and its children move with it. Children keep their own " +
        "tracks, so what covers what is unchanged. " +
        'set_parent takes {"target", "parentId": <group> | null}; the parent ' +
        "must be a clip made with add_group, and a cycle is refused. " +
        'set_clip_params takes {"target", ...fields}; a caption clip\'s look ' +
        'is "captionStyle": {fontFamily?, fontSizeFrac?, color?, activeColor?, ' +
        "outline?, bottomMarginFrac?, background?}, each field optional and " +
        "each absent one keeping the built-in value. " +
        'set_effects takes {"target", "effects": [{type, ...}]} and replaces ' +
        "the whole chain — types color, blur, glow, dropShadow, vignette, " +
        "sharpen, chromaKey, curves, levels, liftGammaGain, applied in the " +
        "order given. An empty list clears it. " +
        'add_marker takes {"timeMs", "label"?, "color"?, "note"?} and ' +
        'delete_marker {"target"} (marker id or label). ' +
        "set_markers_from_beats and snap_to_beats both take a grid — " +
        '"onsets_ms" (detect_audio_events reports `onsets.times` in SECONDS, ' +
        'so multiply by 1000) or "bpm" with "offset_ms"?; ' +
        'set_markers_from_beats also needs "count". snap_to_beats takes ' +
        '"targets" (clip ids or names, or "all"), "tolerance_ms"? (default ' +
        '60), "mode"? ("start" | "end" | "both") and "action"? ("move" slides ' +
        'the clip, "trim" changes its length), and reports every target — ' +
        "including the ones no beat was in reach of, with the reason. " +
        'insert_composition takes {"composition_id", "startMs", trackId?, ' +
        'params?} and drops a stored template — a lower third, a title card, a ' +
        "callout — in as a group with its children, each template track " +
        "becoming an overlay track of its own so the layering survives. " +
        "`params` overrides the template's defaults by name; list_compositions " +
        "reports the ids and what each one takes.",
      items: { type: "object" }
    }
  },
  required: ["timeline_id", "ops"]
};

export const VALIDATE_TIMELINE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    timeline_id: {
      type: "string",
      description: "The ID of a saved timeline sequence to validate"
    },
    document: {
      type: "object",
      description:
        "Inline TimelineDocument to validate ({ tracks, clips, markers }). " +
        "Takes precedence over timeline_id."
    },
    fps: {
      type: "number",
      description:
        "Frame rate the inline document renders at (default 30). Timing " +
        "checks are frame-based, so a document authored at another fps " +
        "validates against the wrong grid without this. Ignored for timeline_id."
    },
    width: {
      type: "number",
      description:
        "Render width of the inline document. Ignored for timeline_id."
    },
    height: {
      type: "number",
      description:
        "Render height of the inline document. Ignored for timeline_id."
    }
  }
};

export const listTimelinesSpec: CapabilitySpec = {
  name: "list_timelines",
  description:
    "List the caller's timeline sequences, most recently updated first: id, " +
    "name, frame rate, resolution, duration, and when it last changed. Start " +
    "here when the user names a timeline but not its id.",
  inputSchema: LIST_TIMELINES_SCHEMA,
  category: "read",
  userMessage: () => "Listing timelines"
};

export const CREATE_TIMELINE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    name: {
      type: "string",
      description: "Name for the new sequence."
    },
    fps: { type: "number", description: "Frame rate. Default 30." },
    width: { type: "number", description: "Render width. Default 1920." },
    height: { type: "number", description: "Render height. Default 1080." },
    project_id: {
      type: "string",
      description: "Project to file it under. Default 'default'."
    }
  },
  required: ["name"]
};

export const createTimelineSpec: CapabilitySpec = {
  name: "create_timeline",
  description:
    "Create an empty timeline sequence and return its id. This is the first " +
    "step of cutting one headlessly: create it, then add tracks and clips " +
    "with edit_timeline. Reach for it rather than editing a sequence the " +
    "user already has open — and rather than a storyboard or script " +
    "assemble, which build a timeline only out of media they rendered " +
    "themselves. Vertical is width 1080, height 1920.",
  inputSchema: CREATE_TIMELINE_SCHEMA,
  category: "write",
  userMessage: (params) => {
    const name = params["name"];
    return isString(name) && name.trim()
      ? `Creating timeline ${name}`
      : "Creating timeline";
  }
};

export const getTimelineSpec: CapabilitySpec = {
  name: "get_timeline",
  description:
    "Read a saved timeline sequence: its fps, size, duration, tracks, clips " +
    "and markers. This is the stored document edit_timeline writes and " +
    "validate_timeline checks — read it before editing so clip and track ids " +
    "come from the sequence rather than a guess.",
  inputSchema: GET_TIMELINE_SCHEMA,
  category: "read",
  userMessage: (params) => `Reading timeline ${String(params["timeline_id"])}`
};

export const listTimelineVersionsSpec: CapabilitySpec = {
  name: "list_timeline_versions",
  description:
    "List a timeline sequence's snapshots, newest first: version number, " +
    "name, save type ('manual', 'autosave', 'restore'), render settings, and " +
    "when it was taken. Call this before restoring — restore_timeline_version " +
    "addresses a snapshot by its version number.",
  inputSchema: LIST_TIMELINE_VERSIONS_SCHEMA,
  category: "read",
  userMessage: (params) =>
    `Listing versions of timeline ${String(params["timeline_id"])}`
};

export const getTimelineVersionSpec: CapabilitySpec = {
  name: "get_timeline_version",
  description:
    "Read one snapshot of a timeline sequence without restoring it: the " +
    "version's metadata plus the full document it stored. Use this to inspect " +
    "or compare versions before deciding which one to restore.",
  inputSchema: GET_TIMELINE_VERSION_SCHEMA,
  category: "read",
  userMessage: (params) =>
    `Reading v${String(params["version"])} of timeline ${String(params["timeline_id"])}`
};

export const createTimelineVersionSpec: CapabilitySpec = {
  name: "create_timeline_version",
  description:
    "Snapshot a timeline sequence's current document as a manual version, so " +
    "it can be restored later. Manual snapshots are never pruned (autosaves " +
    "are), so take one before an edit the user may want undone. Returns the " +
    "new version's number.",
  inputSchema: CREATE_TIMELINE_VERSION_SCHEMA,
  category: "write",
  userMessage: (params) =>
    `Snapshotting timeline ${String(params["timeline_id"])}`
};

export const restoreTimelineVersionSpec: CapabilitySpec = {
  name: "restore_timeline_version",
  description:
    "Roll a timeline sequence's document and render settings back to one of " +
    "its snapshots, addressed by version number (from " +
    "list_timeline_versions). The state being overwritten is snapshotted " +
    "first, so the restore is itself undoable — restore that snapshot to come " +
    "back. An old document is restored against today's schema, so the result " +
    "is validated afterwards and the findings are returned with it.",
  inputSchema: RESTORE_TIMELINE_VERSION_SCHEMA,
  category: "write",
  userMessage: (params) =>
    `Restoring timeline ${String(params["timeline_id"])} to v${String(params["version"])}`
};

export const DELETE_TIMELINE_VERSION_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    timeline_id: {
      type: "string",
      description: "Timeline sequence id."
    },
    version: {
      type: "number",
      description: "Version number to delete, from list_timeline_versions."
    }
  },
  required: ["timeline_id", "version"]
};

export const deleteTimelineVersionSpec: CapabilitySpec = {
  name: "delete_timeline_version",
  description:
    "Delete one snapshot of a timeline sequence you own, addressed by " +
    "version number (from list_timeline_versions). This cannot be undone. " +
    "The live sequence is not changed.",
  inputSchema: DELETE_TIMELINE_VERSION_SCHEMA,
  category: "write",
  userMessage: (params) =>
    `Deleting v${String(params["version"])} of timeline ${String(params["timeline_id"])}`
};

export const editTimelineSpec: CapabilitySpec = {
  name: "edit_timeline",
  description:
    "Edit a saved timeline sequence headlessly: add tracks, add text and " +
    "shape clips, split, trim, move, duplicate and delete clips, set clip " +
    "params and workflow bindings, group clips under a shared transform, " +
    "set transitions, masks, mattes and effect chains, and animate clips " +
    "with presets or keyframed custom curves. Pass a " +
    "list of operations; they run in order against the stored document and " +
    "the result is saved. An open editor picks the change up live. Call " +
    "list_timelines to find a sequence and validate_timeline afterwards. " +
    "Use render_storyboard_clips or a workflow run to generate media — this " +
    "tool authors the cut, it does not render.",
  inputSchema: EDIT_TIMELINE_SCHEMA,
  category: "write",
  userMessage: (params) => {
    const count = Array.isArray(params["ops"]) ? params["ops"].length : 0;
    return `Editing timeline ${String(params["timeline_id"])} (${count} ops)`;
  }
};

export const SET_TIMELINE_DOCUMENT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    timeline_id: {
      type: "string",
      description: "Timeline sequence id (from list_timelines)."
    },
    document: {
      type: "object",
      description:
        "The whole document to store: {tracks, clips, markers, transcript?, " +
        "scriptEnabled?}. It replaces the stored one field for field, so " +
        "anything you leave out is dropped — read the current document with " +
        "get_timeline and send it back changed, rather than sending only the " +
        "part you edited. `markers` may be omitted and defaults to an empty " +
        "list."
    },
    fps: {
      type: "number",
      description:
        "Frame rate to store with the sequence. Omit to keep the current one."
    },
    width: {
      type: "number",
      description: "Render width. Omit to keep the current one."
    },
    height: {
      type: "number",
      description: "Render height. Omit to keep the current one."
    },
    expected_updated_at: {
      type: "string",
      description:
        "The `updated_at` the document was read at. When it no longer " +
        "matches the stored row the write is refused as a conflict instead " +
        "of overwriting whoever changed it in between."
    },
    snapshot_name: {
      type: "string",
      description:
        "Label for the snapshot taken before the write, e.g. 'before the " +
        "title pass'."
    }
  },
  required: ["timeline_id", "document"]
};

export const setTimelineDocumentSpec: CapabilitySpec = {
  name: "set_timeline_document",
  description:
    "Write a whole timeline document at once — every track, clip, marker and " +
    "animation in one call, instead of a script of edit_timeline ops. Reach " +
    "for it when you are authoring a cut from scratch or restructuring one " +
    "wholesale; edit_timeline stays the better tool for a few targeted " +
    "changes to a cut that already exists. The document is validated before " +
    "anything is written: errors refuse the write and come back as issues, " +
    "so a document that would not render never reaches the sequence. The " +
    "state it replaces is snapshotted as a manual version first, so the " +
    "write is undoable with restore_timeline_version, and the validation of " +
    "what actually landed is returned with the result.",
  inputSchema: SET_TIMELINE_DOCUMENT_SCHEMA,
  category: "write",
  userMessage: (params) =>
    `Writing the document of timeline ${String(params["timeline_id"])}`
};

export const validateTimelineSpec: CapabilitySpec = {
  name: "validate_timeline",
  description:
    "Statically validate a timeline sequence WITHOUT rendering or playing it: " +
    "clips on tracks the document lacks, duplicate ids, overlapping clips, " +
    "fades and transitions longer than the clip, in/out points that cannot " +
    "render, unknown animation presets, incomplete bindings, and fields a " +
    "schema round trip would strip. Pass an inline `document` to check one you " +
    "are building, or `timeline_id` to validate a saved sequence. Run it after " +
    "timeline edits and before rendering.",
  inputSchema: VALIDATE_TIMELINE_SCHEMA,
  category: "read",
  userMessage: (params) =>
    params["timeline_id"]
      ? `Validating timeline ${params["timeline_id"]}`
      : "Validating timeline document"
};

/** Largest previewed frame edge. Bigger costs bytes and shows nothing more. */
export const MAX_PREVIEW_WIDTH = 1280;
/** Default previewed frame width — legible without being expensive. */
export const DEFAULT_PREVIEW_WIDTH = 640;
/** Most timecodes one call renders. */
export const MAX_PREVIEW_TIMES = 8;
/** Frames rendered when the caller names no timecodes. */
export const DEFAULT_PREVIEW_COUNT = 3;
/**
 * Most frames a `range` samples. Higher than `MAX_PREVIEW_TIMES` because a
 * dense sweep is read as one contact sheet: the cost is one image handle and
 * one read, not one per timecode.
 */
export const MAX_PREVIEW_RANGE_COUNT = 24;
/** Widest contact sheet. Past this the cells are too small to read anyway. */
export const MAX_SHEET_WIDTH = 1280;
/** Frame width a compare renders at, so a pair fits a cell of the sheet. */
export const DEFAULT_COMPARE_WIDTH = 320;
/**
 * Documented ceiling on previewed motion-blur samples. The render clamps to
 * `MAX_MOTION_BLUR_SAMPLES` in `@nodetool-ai/timeline/scene`; this states the
 * same number without importing it, because this file is the eager spec table
 * and pulls in no implementation.
 */
export const MAX_PREVIEW_BLUR_SAMPLES = 32;
/** The film convention: the shutter is open for half of each frame. */
export const DEFAULT_PREVIEW_SHUTTER_ANGLE = 180;

export const PREVIEW_TIMELINE_FRAME_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    timeline_id: {
      type: "string",
      description:
        "Timeline sequence to render. Omit when passing an inline `document`."
    },
    document: {
      type: "object",
      description:
        "An inline timeline document ({tracks, clips, markers}) to render " +
        "instead of a saved sequence. Needs `width`, `height` and `fps` " +
        "unless they are on the document."
    },
    times_ms: {
      type: "array",
      items: { type: "number" },
      description:
        `Absolute timeline positions to render, in milliseconds. Up to ` +
        `${MAX_PREVIEW_TIMES}. Omit to sample evenly across the sequence.`
    },
    count: {
      type: "number",
      description:
        `How many evenly spaced frames to render when times_ms is omitted. ` +
        `Default 3, max ${MAX_PREVIEW_TIMES}.`
    },
    range: {
      type: "object",
      properties: {
        from_ms: { type: "number" },
        to_ms: { type: "number" },
        count: { type: "number" }
      },
      description:
        `Sweep a window instead of naming timecodes: count frames evenly ` +
        `spaced from from_ms to to_ms, both ends included. Up to ` +
        `${MAX_PREVIEW_RANGE_COUNT} — more than times_ms allows, because a ` +
        `sweep is meant to be read as one sheet. Refused together with ` +
        `times_ms.`
    },
    sheet: {
      type: "boolean",
      description:
        `Tile every frame into one image, each cell labelled with its ` +
        `timecode, instead of one image per frame. One handle to view, and ` +
        `the layer report of each frame comes back unchanged. Up to ` +
        `${MAX_SHEET_WIDTH}px wide.`
    },
    width: {
      type: "number",
      description:
        `Frame width in pixels; the height follows the sequence aspect. ` +
        `Default ${DEFAULT_PREVIEW_WIDTH}, max ${MAX_PREVIEW_WIDTH}.`
    },
    motion_blur_samples: {
      type: "number",
      description:
        `Average this many sub-frame instants into each frame, so fast ` +
        `motion smears the way a render with motion blur on will. 1 (the ` +
        `default) is off; max ${MAX_PREVIEW_BLUR_SAMPLES}. Each sample ` +
        `composites the whole frame again.`
    },
    shutter_angle: {
      type: "number",
      description:
        `How far the shutter opens, in degrees of one frame. ` +
        `${DEFAULT_PREVIEW_SHUTTER_ANGLE} is the film convention (open for ` +
        `half the frame); 360 smears across the whole frame. Ignored unless ` +
        `motion_blur_samples is above 1.`
    }
  },
  required: []
};

export const previewTimelineFrameSpec: CapabilitySpec = {
  name: "preview_timeline_frame",
  description:
    "Render what a timeline actually LOOKS LIKE at chosen timecodes — the " +
    "composited frame, with every track layered in order, clip transforms " +
    "and opacity applied, animations sampled mid-flight, transitions part " +
    "way through, and text and shape clips drawn. This is the tool that " +
    "answers 'is the title readable', 'does the lower-third cover the " +
    "face', 'is the fade halfway at 2s'. Returns one image handle per " +
    "timecode (call view_image on one to see the pixels) plus, for each " +
    "frame, the layers in composite order with their opacity, blend mode " +
    "and wipe progress. Unlike get_clip_frames, which samples one clip's " +
    "source media, this is the finished picture. Needs no browser, GPU or " +
    "open editor. Sample the middle of an animation, not its endpoints — " +
    "the endpoints are the states you already know. `range` sweeps a window " +
    "densely and `sheet` returns the sweep as one labelled contact sheet, " +
    "which is how you watch a move play out rather than checking one instant.",
  inputSchema: PREVIEW_TIMELINE_FRAME_SCHEMA,
  category: "read",
  userMessage: (params) =>
    params["timeline_id"]
      ? `Rendering frames of timeline ${String(params["timeline_id"])}`
      : "Rendering timeline frames"
};

/** The three ways either side of a comparison names a timeline. */
const COMPARE_SIDE_SCHEMA = {
  type: "object" as const,
  properties: {
    timeline_id: {
      type: "string",
      description: "A saved sequence."
    },
    version: {
      type: "number",
      description:
        "With timeline_id, the snapshot of that number rather than the " +
        "sequence as it stands now (from list_timeline_versions)."
    },
    document: {
      type: "object",
      description: "An inline document ({tracks, clips, markers})."
    }
  }
};

export const COMPARE_TIMELINE_FRAMES_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    a: {
      ...COMPARE_SIDE_SCHEMA,
      description:
        "The baseline side. A bare timeline id string works too. " +
        "{timeline_id}, {timeline_id, version} or {document}."
    },
    b: {
      ...COMPARE_SIDE_SCHEMA,
      description:
        "The side to compare against the baseline. Same three forms as `a`."
    },
    times_ms: {
      type: "array",
      items: { type: "number" },
      description:
        `Absolute timeline positions to compare, in milliseconds. Up to ` +
        `${MAX_PREVIEW_RANGE_COUNT}. Omit for an even sweep of the cut.`
    },
    range: {
      type: "object",
      properties: {
        from_ms: { type: "number" },
        to_ms: { type: "number" },
        count: { type: "number" }
      },
      description:
        `count frames evenly spaced from from_ms to to_ms, both ends ` +
        `included. Up to ${MAX_PREVIEW_RANGE_COUNT}. Refused together with ` +
        `times_ms.`
    },
    width: {
      type: "number",
      description:
        `Width of each rendered frame; a pair sits side by side in one cell ` +
        `of the sheet. Default ${DEFAULT_COMPARE_WIDTH}.`
    }
  },
  required: ["a", "b"]
};

export const compareTimelineFramesSpec: CapabilitySpec = {
  name: "compare_timeline_frames",
  description:
    "Measure what actually changed between two timelines — two documents, " +
    "two sequences, or a sequence and one of its snapshots — by " +
    "compositing both at the same timecodes and differencing the pixels. " +
    "Each frame comes back with a mean absolute difference from 0 (nothing " +
    "moved) to 1, and one side-by-side contact sheet shows the pairs. Run " +
    "it after a change nobody asked for — a restructure, a composition " +
    "insert, a snap pass — so you can say which frames it touched instead " +
    "of hoping it touched none. A difference of 0 everywhere is the proof " +
    "an edit was cosmetic; a difference at times you did not expect is the " +
    "regression.",
  inputSchema: COMPARE_TIMELINE_FRAMES_SCHEMA,
  category: "read",
  userMessage: () => "Comparing timeline frames"
};

/** Longest a `wait: true` render blocks before handing back the job id. */
export const MAX_RENDER_TIMEOUT_MS = 30 * 60_000;
/** How long `wait: true` waits when the caller names no timeout. */
export const DEFAULT_RENDER_TIMEOUT_MS = 10 * 60_000;

export const RENDER_TIMELINE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    timeline_id: {
      type: "string",
      description: "Timeline sequence to render (from list_timelines)."
    },
    format: {
      type: "string",
      description:
        "Container to write: 'mp4' (default), 'webm', 'mov', or " +
        "'png_sequence' (frames zipped with a manifest). Only webm, mov and " +
        "png_sequence carry alpha."
    },
    alpha: {
      type: "boolean",
      description:
        "Keep transparency instead of compositing onto black. Refused with " +
        "an mp4."
    },
    video_codec: {
      type: "string",
      description:
        "Video codec, when the container allows more than one. Omit for the " +
        "format's default."
    },
    bitrate: {
      type: "string",
      description:
        "Target video bitrate, e.g. '8M'. Omit for the encoder's default."
    },
    motion_blur_samples: {
      type: "number",
      description:
        "Sub-frame samples averaged per frame. 1 (default) is no blur; 8 is " +
        "a smooth smear and costs 8x the render time."
    },
    shutter_angle: {
      type: "number",
      description:
        "Fraction of the frame the shutter is open, in degrees (180 = half " +
        "the frame). Only read when motion_blur_samples is above 1."
    },
    preview_scale: {
      type: "number",
      description:
        "Render at this fraction of the sequence size. 0.5 is roughly a " +
        "quarter of the time — use it for the drafts you look at, then " +
        "render at 1 once the cut is right."
    },
    include_audio: {
      type: "boolean",
      description: "Mix audio-track clips into the render. Default true."
    },
    wait: {
      type: "boolean",
      description:
        "Block until the render settles and return the finished asset. " +
        "Default false: the call returns a job_id immediately and get_job " +
        "reports it."
    },
    timeout_ms: {
      type: "number",
      description:
        `How long to wait when wait is true. Default ` +
        `${DEFAULT_RENDER_TIMEOUT_MS}, max ${MAX_RENDER_TIMEOUT_MS}. On a ` +
        `timeout the render keeps going and the job_id comes back anyway.`
    }
  },
  required: ["timeline_id"]
};

export const renderTimelineSpec: CapabilitySpec = {
  name: "render_timeline",
  description:
    "Render a timeline sequence to a video file — the finished cut, " +
    "composited exactly as the editor previews it, with audio mixed in. " +
    "Runs as a job, so `get_job` and `get_job_logs` report on it and " +
    "`cancel_job` stops it. With `wait` it blocks and hands back the " +
    "rendered asset. Render before you say a cut is done, then look at what " +
    "came out: `preview_timeline_frame` answers what one timecode looks " +
    "like, `analyze_video` measures the file, and `understand_video` " +
    "describes it. `preview_scale` renders a draft at a fraction of the " +
    "size while you are still iterating.",
  inputSchema: RENDER_TIMELINE_SCHEMA,
  category: "write",
  userMessage: (params) =>
    `Rendering timeline ${String(params["timeline_id"])}`
};

export const deleteTimelineSpec: CapabilitySpec = {
  name: "delete_timeline",
  description:
    "Delete a timeline sequence you own, together with its saved version history. " +
    "This cannot be undone. A timeline sequence belonging to another user is reported " +
    "as missing.",
  inputSchema: {
    type: "object",
    properties: {
      timeline_id: {
        type: "string",
        description: "The timeline sequence to delete. You must own it."
      }
    },
    required: ["timeline_id"]
  },
  category: "write",
  userMessage: (params) => `Deleting timeline sequence ${params["timeline_id"]}`
};

/** Every spec this module declares, in declaration order. */
export const timelinesSpecs: readonly CapabilitySpec[] = [
  listTimelinesSpec,
  createTimelineSpec,
  getTimelineSpec,
  listTimelineVersionsSpec,
  getTimelineVersionSpec,
  createTimelineVersionSpec,
  restoreTimelineVersionSpec,
  deleteTimelineVersionSpec,
  editTimelineSpec,
  validateTimelineSpec,
  setTimelineDocumentSpec,
  previewTimelineFrameSpec,
  compareTimelineFramesSpec,
  renderTimelineSpec,
  deleteTimelineSpec
];
