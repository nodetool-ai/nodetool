/**
 * The names of the timeline snapshot-history tools — find a cut, pin a state,
 * roll one back.
 *
 * The implementations live in the `timelines` capability module
 * (`../capabilities/timelines.ts`); a belt reaches them by name.
 */

/** Every tool in this module, for toolbelt assembly and docs. */
export const TIMELINE_VERSION_TOOL_NAMES = [
  "list_timelines",
  "list_timeline_versions",
  "get_timeline_version",
  "create_timeline_version",
  "restore_timeline_version",
  "delete_timeline_version"
] as const;
