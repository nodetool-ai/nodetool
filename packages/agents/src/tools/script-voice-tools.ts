/**
 * The names of the script voicing tools — the fast path from a written script
 * to voiced takes and an assembled voiceover sequence, with no workflow in
 * between.
 *
 *   list_scripts             — find a script to work on
 *   get_script               — cast, lines, and each line's voicing status
 *   voice_script_lines       — synthesize the lines that need it, many per call
 *   assemble_script_timeline — voiced takes → a saved timeline sequence
 *   edit_script              — write the lines in the first place
 *
 * The implementations live in the `scripts` capability module
 * (`../capabilities/scripts.ts`); a belt reaches them by name.
 */

/** Every tool in this module, for toolbelt assembly and docs. */
export const SCRIPT_VOICE_TOOL_NAMES = [
  "list_scripts",
  "get_script",
  "voice_script_lines",
  "assemble_script_timeline",
  "edit_script",
  "derive_storyboard_from_script"
] as const;
