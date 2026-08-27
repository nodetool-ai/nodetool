/**
 * The `storyboards` module's specs — data only, no implementation.
 *
 * Split out so a belt can be assembled synchronously: the registry's eager
 * spec table imports this file, never `storyboards.ts`, so nothing the
 * implementations pull in reaches the entry graph. `storyboards.ts` imports these
 * back and attaches each to its implementation, so there is one spec object
 * behind both halves.
 */

import type { CapabilitySpec } from "./types.js";
import type { JsonSchema } from "@nodetool-ai/runtime";

export const DEFAULT_CONCURRENCY = 3;

export const MAX_CONCURRENCY = 8;

export const SHOT_TARGETS_SCHEMA = {
  type: "array" as const,
  items: { type: "string" as const },
  description:
    "Shots to render, each a shot id, 0-based index, or slug. Omit to render " +
    "every shot that still needs this step."
};

export const LIST_STORYBOARDS_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    limit: { type: "number", description: "Max boards to return (default 20)." }
  }
};

export const CREATE_STORYBOARD_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    name: {
      type: "string",
      description: "Name of the new storyboard."
    },
    brief: {
      type: "string",
      description: "Board brief. Defaults to empty."
    },
    style: {
      type: "string",
      description: "Style text appended to every shot prompt. Defaults to empty."
    },
    aspect_ratio: {
      type: "string",
      description: "Shot aspect ratio, e.g. '16:9' (default '16:9')."
    },
    project_id: {
      type: "string",
      description: "Project to create the storyboard in (default 'default')."
    },
    id: {
      type: "string",
      description:
        "Optional id. If a storyboard with this id already exists and you " +
        "own it, that row is returned instead of creating a duplicate."
    }
  },
  required: ["name"]
};

export const GET_STORYBOARD_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    storyboard_id: { type: "string", description: "Storyboard id." }
  },
  required: ["storyboard_id"]
};

export const RENDER_STILLS_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    storyboard_id: { type: "string", description: "Storyboard id." },
    targets: SHOT_TARGETS_SCHEMA,
    provider: {
      type: "string",
      description:
        "Provider id (from find_model). Defaults to the board's image model."
    },
    model: {
      type: "string",
      description:
        "Model id (from find_model). Defaults to the board's image model."
    },
    style: {
      type: "string",
      description:
        "Style text appended to every prompt. Defaults to the board's style."
    },
    concurrency: {
      type: "number",
      description: `Shots rendered in parallel (default ${DEFAULT_CONCURRENCY}, max ${MAX_CONCURRENCY}).`
    }
  },
  required: ["storyboard_id"]
};

export const RENDER_CLIPS_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    storyboard_id: { type: "string", description: "Storyboard id." },
    targets: SHOT_TARGETS_SCHEMA,
    provider: {
      type: "string",
      description:
        "Provider id (from find_model). Defaults to the board's video model."
    },
    model: {
      type: "string",
      description:
        "Model id (from find_model). Defaults to the board's video model."
    },
    resolution: {
      type: "string",
      description: "Provider resolution hint, e.g. '720p'."
    },
    mode: {
      type: "string",
      enum: ["keyframe", "direct"],
      description:
        "Override how the selected shots render, for this call only. " +
        "'keyframe' animates each shot's still (image_to_video); 'direct' " +
        "generates from the prompt with no still (text_to_video). Defaults " +
        "to each shot's own render_mode, which defaults to 'keyframe'. Set " +
        "the shot's render_mode with edit_storyboard to make it stick."
    },
    concurrency: {
      type: "number",
      description: `Shots rendered in parallel (default ${DEFAULT_CONCURRENCY}, max ${MAX_CONCURRENCY}).`
    }
  },
  required: ["storyboard_id"]
};

export const REVISE_CLIP_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    storyboard_id: { type: "string", description: "Storyboard id." },
    target: {
      type: "string",
      description: "Shot id, 0-based index, or slug."
    },
    instruction: {
      type: "string",
      description: "The change to make, phrased as a video edit prompt."
    },
    provider: { type: "string", description: "Provider id (from find_model)." },
    model: { type: "string", description: "Model id (from find_model)." }
  },
  required: ["storyboard_id", "target", "instruction"]
};

export const ASSEMBLE_STORYBOARD_TIMELINE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    storyboard_id: { type: "string", description: "Storyboard id." },
    name: {
      type: "string",
      description: "Name for the sequence. Defaults to the storyboard's name."
    },
    fps: { type: "number", description: "Frame rate (default 30)." }
  },
  required: ["storyboard_id"]
};

export const EDIT_STORYBOARD_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    storyboard_id: { type: "string", description: "Storyboard id." },
    ops: {
      type: "array",
      description:
        'Operations in order. Each is {"op": <name>, ...arguments}: ' +
        "add_shot {action, slug?, camera?, motion?, dialogue?, narration?, " +
        "duration_seconds?, duration_source?, render_mode?, entity_ids?, " +
        "location_id?, notes?, index?}, " +
        "update_shot {target, ...same fields}, remove_shot {target}, " +
        "reorder_shot {target, index}, set_board {brief?, style?, " +
        "aspect_ratio?, entity_ids?}. `target` is a shot id, its 0-based " +
        "index, or its slug.",
      items: { type: "object" }
    }
  },
  required: ["storyboard_id", "ops"]
};

export const EXTRACT_SCRIPT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    storyboard_id: { type: "string", description: "Storyboard id." },
    name: {
      type: "string",
      description:
        "Name for the created script. Defaults to the board's name + ' script'."
    },
    relink: {
      type: "boolean",
      description:
        "Re-project onto the script the board already links, instead of " +
        "failing. Rewrites that script's lines and the board's line " +
        "references; every take voiced from a changed line becomes stale."
    }
  },
  required: ["storyboard_id"]
};

export const listStoryboardsSpec: CapabilitySpec = {
  name: "list_storyboards",
  description:
    "List the caller's storyboards, newest first: id, name, shot count, how " +
    "many shots have a still and a clip, and the timeline it was assembled " +
    "into. Start here when the user names a board but not its id.",
  inputSchema: LIST_STORYBOARDS_SCHEMA,
  category: "read",
  userMessage: () => "Listing storyboards"
};

export const createStoryboardSpec: CapabilitySpec = {
  name: "create_storyboard",
  description:
    "Create a blank storyboard and return its id. This is the first step of " +
    "directing one headlessly: create it, then add and rewrite shots with " +
    "edit_storyboard. An open editor picks the new board up once you open it. " +
    "Stills and clips stay empty — render them with render_storyboard_stills " +
    "and render_storyboard_clips.",
  inputSchema: CREATE_STORYBOARD_SCHEMA,
  category: "write",
  userMessage: (params) => {
    const name = params["name"];
    return typeof name === "string" && name.trim()
      ? `Creating storyboard ${name}`
      : "Creating storyboard";
  }
};

export const getStoryboardSpec: CapabilitySpec = {
  name: "get_storyboard",
  description:
    "Read one storyboard: brief, style, aspect ratio, the still/clip models it " +
    "renders with, and every shot with its id, index, slug, action, camera, " +
    "motion, duration, status, and whether it already has a still or a clip. " +
    "Call this before rendering — the other tools address shots by these ids.",
  inputSchema: GET_STORYBOARD_SCHEMA,
  category: "read",
  userMessage: (params) =>
    `Reading storyboard ${String(params["storyboard_id"])}`
};

export const renderStoryboardStillsSpec: CapabilitySpec = {
  name: "render_storyboard_stills",
  description:
    "Render keyframe stills for a storyboard's shots by calling the image " +
    "model directly — no workflow is created or run. Each still is saved as an " +
    "asset and becomes the shot's selected keyframe (previous stills are kept " +
    "as versions). Omit `targets` to render every shot that has no still yet " +
    "and is not set to render directly, so a whole board is one call. Stills " +
    "are the cheap step: render them, look at them, then spend on clips.",
  inputSchema: RENDER_STILLS_SCHEMA,
  category: "write",
  userMessage: (params) => {
    const targets = params["targets"];
    const count = Array.isArray(targets) ? `${targets.length} ` : "";
    return `Rendering ${count}storyboard stills`;
  }
};

export const renderStoryboardClipsSpec: CapabilitySpec = {
  name: "render_storyboard_clips",
  description:
    "Render video clips for a storyboard's shots with the video model " +
    "directly — no workflow is created or run. A shot renders the way its " +
    "render_mode says: 'keyframe' (the default) animates its selected still " +
    "with image_to_video, 'direct' generates from the prompt with " +
    "text_to_video and needs no still. Pass `mode` to override both for this " +
    "call. Each clip is saved as an asset and attached to its shot (previous " +
    "takes are kept as versions), leaving the shot 'rendered' and ready for " +
    "assemble_storyboard_timeline. Omit `targets` to render every shot that " +
    "still needs a clip and can render one. A keyframe-mode shot with no " +
    "still is reported, not rendered — run render_storyboard_stills first, or " +
    "set its render_mode to 'direct'. This is the expensive step.",
  inputSchema: RENDER_CLIPS_SCHEMA,
  category: "write",
  userMessage: (params) => {
    const targets = params["targets"];
    const count = Array.isArray(targets) ? `${targets.length} ` : "";
    return `Rendering ${count}storyboard clips`;
  }
};

export const reviseStoryboardClipSpec: CapabilitySpec = {
  name: "revise_storyboard_clip",
  description:
    "Revise one shot's rendered clip with a text instruction ('make it darker, " +
    "add rain') via video-to-video. Seeds the shot's current clip and swaps the " +
    "result in as the selected take, keeping the previous one as a version. The " +
    "shot must already have a clip.",
  inputSchema: REVISE_CLIP_SCHEMA,
  category: "write",
  userMessage: (params) => `Revising shot ${String(params["target"])}`
};

export const assembleStoryboardTimelineSpec: CapabilitySpec = {
  name: "assemble_storyboard_timeline",
  description:
    "Lay a storyboard's rendered clips end to end into a timeline sequence and " +
    "save it, without building a workflow. Clips keep their link to the shot " +
    "they came from, and the screenplay's narration and music become draft " +
    "audio clips the timeline can generate on demand. When the board links a " +
    "script, each shot is instead as long as the takes it covers and every " +
    "voiced line gets its own voiceover clip. Shots with no rendered clip, " +
    "and lines with no take, are skipped and listed. Re-running rebuilds the " +
    "same sequence in place, keeping tracks the board does not own. Validate " +
    "the result with validate_timeline before rendering.",
  inputSchema: ASSEMBLE_STORYBOARD_TIMELINE_SCHEMA,
  category: "write",
  userMessage: (params) =>
    `Assembling storyboard ${String(params["storyboard_id"])} into a timeline`
};

export const editStoryboardSpec: CapabilitySpec = {
  name: "edit_storyboard",
  description:
    "Edit a saved storyboard's shot list headlessly: add, rewrite, remove and " +
    "reorder shots, and set the board's brief, style, aspect ratio and " +
    "entities. Operations run in order against the stored document and the " +
    "result is saved; an open board picks the change up live. Rendering stays " +
    "with render_storyboard_stills / render_storyboard_clips — this tool " +
    "directs, it does not spend. Call get_storyboard first for shot ids.",
  inputSchema: EDIT_STORYBOARD_SCHEMA,
  category: "write",
  userMessage: (params) => {
    const count = Array.isArray(params["ops"]) ? params["ops"].length : 0;
    return `Editing storyboard ${String(params["storyboard_id"])} (${count} ops)`;
  }
};

export const extractScriptFromStoryboardSpec: CapabilitySpec = {
  name: "extract_script_from_storyboard",
  description:
    "Project a storyboard's spoken words into a new script resource and link " +
    "the two: every shot's dialogue and narration becomes a script line, the " +
    "character entity a shot names becomes a cast member, and each shot keeps " +
    "the ids of the lines it covers. The board keeps its visuals, the script " +
    "owns the words from here on — voice them with voice_script_lines. Fails " +
    "when the board already links a script; pass relink: true to re-project " +
    "onto that script instead.",
  inputSchema: EXTRACT_SCRIPT_SCHEMA,
  category: "write",
  userMessage: (params) =>
    `Extracting a script from storyboard ${String(params["storyboard_id"])}`
};

export const deleteStoryboardSpec: CapabilitySpec = {
  name: "delete_storyboard",
  description:
    "Delete a storyboard you own, together with its saved version history. " +
    "This cannot be undone. A storyboard belonging to another user is reported " +
    "as missing.",
  inputSchema: {
    type: "object",
    properties: {
      storyboard_id: {
        type: "string",
        description: "The storyboard to delete. You must own it."
      }
    },
    required: ["storyboard_id"]
  },
  category: "write",
  userMessage: (params) => `Deleting storyboard ${params["storyboard_id"]}`
};

/** Every spec this module declares, in declaration order. */
export const storyboardsSpecs: readonly CapabilitySpec[] = [
  listStoryboardsSpec,
  createStoryboardSpec,
  getStoryboardSpec,
  renderStoryboardStillsSpec,
  renderStoryboardClipsSpec,
  reviseStoryboardClipSpec,
  assembleStoryboardTimelineSpec,
  editStoryboardSpec,
  extractScriptFromStoryboardSpec,
  deleteStoryboardSpec
];
