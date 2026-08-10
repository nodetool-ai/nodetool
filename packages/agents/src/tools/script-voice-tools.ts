/**
 * Script voicing tools — the fast path from a written script to voiced takes
 * and an assembled voiceover sequence, with no workflow in between.
 *
 *   list_scripts             — find a script to work on
 *   get_script               — cast, lines, and each line's voicing status
 *   voice_script_lines       — synthesize the lines that need it, many per call
 *   assemble_script_timeline — voiced takes → a saved timeline sequence
 *   edit_script              — write the lines in the first place
 *
 * The implementations moved to the `scripts` capability module
 * (`../capabilities/scripts.ts`); the classes below are thin wrappers over them
 * so `BUILTIN_TOOL_CLASSES` and every belt that names them keep working.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  CapabilityTool,
  UNGATED,
  createCapabilityRun,
  type CapabilityRun
} from "../capabilities/index.js";
import {
  assembleScriptTimeline,
  editScript,
  getScript,
  listScripts,
  voiceScriptLines
} from "../capabilities/scripts.js";

/** These capabilities need nothing per-run beyond the calling context. */
const scriptRun = (context: ProcessingContext): CapabilityRun =>
  createCapabilityRun({ context, gate: UNGATED });

/**
 * @deprecated Ported to the `scripts` capability module
 * (`../capabilities/scripts.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class ListScriptsTool extends CapabilityTool {
  constructor() {
    super(listScripts.spec, listScripts.impl, scriptRun);
  }
}

/**
 * @deprecated Ported to the `scripts` capability module
 * (`../capabilities/scripts.ts`).
 */
export class GetScriptTool extends CapabilityTool {
  constructor() {
    super(getScript.spec, getScript.impl, scriptRun);
  }
}

/**
 * @deprecated Ported to the `scripts` capability module
 * (`../capabilities/scripts.ts`).
 */
export class VoiceScriptLinesTool extends CapabilityTool {
  constructor() {
    super(voiceScriptLines.spec, voiceScriptLines.impl, scriptRun);
  }
}

/**
 * @deprecated Ported to the `scripts` capability module
 * (`../capabilities/scripts.ts`).
 */
export class AssembleScriptTimelineTool extends CapabilityTool {
  constructor() {
    super(assembleScriptTimeline.spec, assembleScriptTimeline.impl, scriptRun);
  }
}

/**
 * @deprecated Ported to the `scripts` capability module
 * (`../capabilities/scripts.ts`).
 */
export class EditScriptTool extends CapabilityTool {
  constructor() {
    super(editScript.spec, editScript.impl, scriptRun);
  }
}

/** Every tool in this module, for toolbelt assembly and docs. */
export const SCRIPT_VOICE_TOOL_NAMES = [
  "list_scripts",
  "get_script",
  "voice_script_lines",
  "assemble_script_timeline",
  "edit_script"
] as const;
