/**
 * The names of the sketch snapshot-history tools — find a sketch, pin a state,
 * roll one back.
 *
 * The implementations live in the `sketches` capability module
 * (`../capabilities/sketches.ts`); a belt reaches them by name.
 */

/** Every tool in this module, for toolbelt assembly and docs. */
export const SKETCH_VERSION_TOOL_NAMES = [
  "list_sketches",
  "list_sketch_versions",
  "get_sketch_version",
  "create_sketch_version",
  "restore_sketch_version",
  "delete_sketch_version"
] as const;
