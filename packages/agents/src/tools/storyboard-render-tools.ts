/**
 * The names of the storyboard render tools — the path from a directed board to
 * rendered media and an assembled cut, with no workflow in between.
 *
 * The implementations live in the `storyboards` capability module
 * (`../capabilities/storyboards.ts`); a belt reaches them by name.
 */

/** Every tool in this module, for toolbelt assembly and docs. */
export const STORYBOARD_RENDER_TOOL_NAMES = [
  "list_storyboards",
  "create_storyboard",
  "get_storyboard",
  "render_storyboard_stills",
  "render_storyboard_clips",
  "revise_storyboard_clip",
  "assemble_storyboard_timeline",
  "edit_storyboard",
  "extract_script_from_storyboard"
] as const;
