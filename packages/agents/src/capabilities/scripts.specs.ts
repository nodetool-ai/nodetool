/**
 * The `scripts` module's specs — data only, no implementation.
 *
 * Split out so a belt can be assembled synchronously: the registry's eager
 * spec table imports this file, never `scripts.ts`, so nothing the
 * implementations pull in reaches the entry graph. `scripts.ts` imports these
 * back and attaches each to its implementation, so there is one spec object
 * behind both halves.
 */

import type { CapabilitySpec } from "./types.js";
import type { JsonSchema } from "@nodetool-ai/runtime";

export const DEFAULT_CONCURRENCY = 3;

export const MAX_CONCURRENCY = 8;

export const DEFAULT_ASR_PROVIDER = "openai";

export const DEFAULT_ASR_MODEL = "whisper-1";

export const LINE_TARGETS_SCHEMA = {
  type: "array" as const,
  items: { type: "string" as const },
  description:
    "Lines to voice, each a line id, 0-based reading-order index, or the " +
    "line's exact text. Omit to voice every line that is unvoiced or stale."
};

export const LIST_SCRIPTS_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    limit: {
      type: "number",
      description: "Max scripts to return (default 20)."
    }
  }
};

export const GET_SCRIPT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    script_id: { type: "string", description: "Script id." }
  },
  required: ["script_id"]
};

export const VOICE_SCRIPT_LINES_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    script_id: { type: "string", description: "Script id." },
    targets: LINE_TARGETS_SCHEMA,
    provider: {
      type: "string",
      description:
        "TTS provider id (from find_model, capability=text_to_speech). Overrides every line's own voice."
    },
    model: {
      type: "string",
      description:
        "TTS model id (from find_model). Overrides every line's own voice."
    },
    voice: {
      type: "string",
      description:
        "Voice id for the override. Required when provider/model are passed."
    },
    speed: {
      type: "number",
      description:
        "Speech speed multiplier passed to the provider (e.g. 0.25–4.0)."
    },
    transcribe: {
      type: "boolean",
      description:
        "Transcribe each take for word timings (default true). Set false to skip the extra ASR call."
    },
    asr_provider: {
      type: "string",
      description: `Provider for word timings (default ${DEFAULT_ASR_PROVIDER}).`
    },
    asr_model: {
      type: "string",
      description: `Model for word timings (default ${DEFAULT_ASR_MODEL}).`
    },
    concurrency: {
      type: "number",
      description: `Lines voiced in parallel (default ${DEFAULT_CONCURRENCY}, max ${MAX_CONCURRENCY}).`
    }
  },
  required: ["script_id"]
};

export const ASSEMBLE_SCRIPT_TIMELINE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    script_id: { type: "string", description: "Script id." },
    name: {
      type: "string",
      description: "Name for the sequence. Defaults to the script's name."
    },
    fps: { type: "number", description: "Frame rate (default 30)." }
  },
  required: ["script_id"]
};

export const EDIT_SCRIPT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    script_id: { type: "string", description: "Script id." },
    ops: {
      type: "array",
      description:
        'Operations in order. Each is {"op": <name>, ...arguments}: ' +
        "add_speaker {name, color?, provider?, model?, voice?, entityId?}, " +
        "set_speaker {target, name?, color?, entityId?}, " +
        "set_speaker_voice {target, provider, model, voice, settings?}, " +
        "remove_speaker {target}, add_section {title?}, " +
        "add_line {text, speaker?, section?, direction?, pause_after_ms?, index?}, " +
        "set_line_text {target, text}, set_line_speaker {target, speaker}, " +
        "remove_line {target}. `entityId` is an asset id from the ingredient " +
        "library (list_entities) — when set the speaker is that character/entity " +
        "and storyboard renders can season prompts with it. A line `target` is " +
        "its id, its 0-based index across the script, or its exact text; a " +
        "speaker `target` is its id or name. `set_speaker` renames a cast " +
      "member; the op that gives a LINE its speaker is `set_line_speaker`. An " +
      "argument an op does not take is refused rather than ignored, so a " +
      "misspelled key is reported instead of silently dropping its value.",
      items: { type: "object" }
    }
  },
  required: ["script_id", "ops"]
};

export const DERIVE_STORYBOARD_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    script_id: { type: "string", description: "Script id." },
    provider: {
      type: "string",
      description:
        "Language-model provider id (from find_model) for the director pass " +
        "that writes each shot's visuals. Omit provider and model together to " +
        "get the deterministic scaffold only."
    },
    model: {
      type: "string",
      description:
        "Language model id (from find_model) for the director pass. Omit " +
        "provider and model together to get the deterministic scaffold only."
    },
    name: {
      type: "string",
      description:
        "Name for the created storyboard. Defaults to the script's name."
    }
  },
  required: ["script_id"]
};

export const CREATE_SCRIPT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    name: { type: "string", description: "Name of the new script." },
    project_id: {
      type: "string",
      description: "Project to create the script in (default 'default')."
    },
    id: {
      type: "string",
      description:
        "Id to create it under. An id that already exists is returned as-is, " +
        "so a retry does not duplicate the script."
    }
  },
  required: ["name"]
};

export const createScriptSpec: CapabilitySpec = {
  name: "create_script",
  description:
    "Create an empty script and return its id. This is the first step of " +
    "writing one headlessly: create it, then add speakers and lines with " +
    "edit_script, and voice them with voice_script_lines. Use " +
    "extract_script_from_storyboard instead when the words already exist as " +
    "shot dialogue on a board.",
  inputSchema: CREATE_SCRIPT_SCHEMA,
  category: "write",
  userMessage: (params) => `Creating script ${String(params["name"])}`
};

export const listScriptsSpec: CapabilitySpec = {
  name: "list_scripts",
  description:
    "List the caller's scripts, newest first: id, name, cast size, line count, " +
    "how many lines are voiced, and the timeline it was assembled into. Start " +
    "here when the user names a script but not its id.",
  inputSchema: LIST_SCRIPTS_SCHEMA,
  category: "read",
  userMessage: () => "Listing scripts"
};

export const getScriptSpec: CapabilitySpec = {
  name: "get_script",
  description:
    "Read one script: its cast with each speaker's voice, and every line in " +
    "reading order with its id, index, speaker, text, direction, pause, " +
    "effective voice, and voicing status ('draft' = never voiced, 'stale' = " +
    "text or voice changed since the take, 'voiced' = up to date, 'no_voice' = " +
    "no speaker voice assigned). Call this before voicing — the other tools " +
    "address lines by these ids.",
  inputSchema: GET_SCRIPT_SCHEMA,
  category: "read",
  userMessage: (params) => `Reading script ${String(params["script_id"])}`
};

export const voiceScriptLinesSpec: CapabilitySpec = {
  name: "voice_script_lines",
  description:
    "Synthesize speech for a script's lines by calling the TTS provider " +
    "directly — no workflow is created or run. Each take is saved as an audio " +
    "asset, appended to its line, and made the line's current take (earlier " +
    "takes are kept). Omit `targets` to voice every line that is unvoiced or " +
    "stale, so a whole script is one call. Each line uses its own voice (its " +
    "override, else its speaker's) unless you pass provider/model/voice to " +
    "override them all. Word timings are transcribed best-effort so the " +
    "assembled timeline carries captions.",
  inputSchema: VOICE_SCRIPT_LINES_SCHEMA,
  category: "write",
  userMessage: (params) => {
    const targets = params["targets"];
    const count = Array.isArray(targets) ? `${targets.length} ` : "";
    return `Voicing ${count}script lines`;
  }
};

export const assembleScriptTimelineSpec: CapabilitySpec = {
  name: "assemble_script_timeline",
  description:
    "Lay a script's voiced takes end to end into a voiceover timeline sequence " +
    "and save it, without building a workflow. Each clip carries its take's " +
    "word timings, the speaker label, and a link back to its script line, so a " +
    "later re-voice can round-trip into the cut. Lines with no voiced take are " +
    "skipped and listed. Re-running rebuilds the same sequence in place, " +
    "keeping clips other surfaces added. Validate the result with " +
    "validate_timeline before rendering.",
  inputSchema: ASSEMBLE_SCRIPT_TIMELINE_SCHEMA,
  category: "write",
  userMessage: (params) =>
    `Assembling script ${String(params["script_id"])} into a timeline`
};

export const editScriptSpec: CapabilitySpec = {
  name: "edit_script",
  description:
    "Edit a saved script headlessly: add cast members and assign their " +
    "voices, add sections, and add, rewrite, reassign and remove lines. " +
    "Operations run in order against the stored document and the result is " +
    "saved; an open editor picks the change up live. Rewriting a line leaves " +
    "its takes in place as stale, so voice_script_lines re-records exactly " +
    "those. Call get_script first for line and speaker ids.",
  inputSchema: EDIT_SCRIPT_SCHEMA,
  category: "write",
  userMessage: (params) => {
    const count = Array.isArray(params["ops"]) ? params["ops"].length : 0;
    return `Editing script ${String(params["script_id"])} (${count} ops)`;
  }
};

export const deriveStoryboardFromScriptSpec: CapabilitySpec = {
  name: "derive_storyboard_from_script",
  description:
    "Create a storyboard whose shots cover this script's lines, linked to it: " +
    "one shot per line in reading order, each carrying the line ids it covers " +
    "and the projected dialogue/narration. With provider + model, a director " +
    "pass writes each shot's action, slug, camera and motion over that " +
    "scaffold; a response that drops or reassigns the line links is refused " +
    "and retried, and the scaffold is the floor. Without them the shots are " +
    "the scaffold alone, status 'planned'. Render it with " +
    "render_storyboard_stills.",
  inputSchema: DERIVE_STORYBOARD_SCHEMA,
  category: "write",
  userMessage: (params) =>
    `Deriving a storyboard from script ${String(params["script_id"])}`
};

export const deleteScriptSpec: CapabilitySpec = {
  name: "delete_script",
  description:
    "Delete a script you own, together with its saved version history. " +
    "This cannot be undone. A script belonging to another user is reported " +
    "as missing.",
  inputSchema: {
    type: "object",
    properties: {
      script_id: {
        type: "string",
        description: "The script to delete. You must own it."
      }
    },
    required: ["script_id"]
  },
  category: "write",
  userMessage: (params) => `Deleting script ${params["script_id"]}`
};

/** Every spec this module declares, in declaration order. */
export const scriptsSpecs: readonly CapabilitySpec[] = [
  listScriptsSpec,
  createScriptSpec,
  getScriptSpec,
  voiceScriptLinesSpec,
  assembleScriptTimelineSpec,
  editScriptSpec,
  deriveStoryboardFromScriptSpec,
  deleteScriptSpec
];
