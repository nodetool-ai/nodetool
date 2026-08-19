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
        "Ops: get_state, add_track, add_text_clip, add_shape_clip, " +
        "split_clip, trim_clip, move_clip, duplicate_clip, delete_clip, " +
        "set_clip_params, set_clip_binding, animate_clip, clear_animations, " +
        "list_animation_presets, select_clip, seek. Start with get_state to " +
        "read track and clip ids.",
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

export const editTimelineSpec: CapabilitySpec = {
  name: "edit_timeline",
  description:
    "Edit a saved timeline sequence headlessly: add tracks, add text and " +
    "shape clips, split, trim, move, duplicate and delete clips, set clip " +
    "params and workflow bindings, and animate clips with presets. Pass a " +
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
  listTimelineVersionsSpec,
  getTimelineVersionSpec,
  createTimelineVersionSpec,
  restoreTimelineVersionSpec,
  editTimelineSpec,
  validateTimelineSpec,
  deleteTimelineSpec
];
