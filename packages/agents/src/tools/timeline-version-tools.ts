/**
 * Timeline version tools — snapshot history for a timeline sequence, headlessly.
 *
 * A sequence keeps immutable snapshots: manual saves, the autosaves a document
 * write takes at most every five minutes, and the pre-restore snapshot that
 * makes a restore undoable. Reading and moving through that history was
 * tRPC-only, so an agent outside the browser could not roll a cut back to a
 * version the user liked, or pin the current state before a risky recut.
 *
 *   list_timelines          — find a sequence to work on
 *   list_timeline_versions  — its snapshots, newest first
 *   get_timeline_version    — read one snapshot's document without restoring
 *   create_timeline_version — pin the current state as a manual snapshot
 *   restore_timeline_version — roll the sequence back to one
 *
 * The implementations moved to the `timelines` capability module
 * (`../capabilities/timelines.ts`); the classes below are thin wrappers over
 * them so `BUILTIN_TOOL_CLASSES` and every belt that names them keep working.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  CapabilityTool,
  UNGATED,
  createCapabilityRun,
  type CapabilityRun
} from "../capabilities/index.js";
import {
  createTimelineVersion,
  getTimelineVersion,
  listTimelineVersions,
  listTimelines,
  restoreTimelineVersion
} from "../capabilities/timelines.js";

/** These capabilities need nothing per-run beyond the calling context. */
const timelineRun = (context: ProcessingContext): CapabilityRun =>
  createCapabilityRun({ context, gate: UNGATED });

/**
 * @deprecated Ported to the `timelines` capability module
 * (`../capabilities/timelines.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class ListTimelinesTool extends CapabilityTool {
  constructor() {
    super(listTimelines.spec, listTimelines.impl, timelineRun);
  }
}

/**
 * @deprecated Ported to the `timelines` capability module
 * (`../capabilities/timelines.ts`).
 */
export class ListTimelineVersionsTool extends CapabilityTool {
  constructor() {
    super(listTimelineVersions.spec, listTimelineVersions.impl, timelineRun);
  }
}

/**
 * @deprecated Ported to the `timelines` capability module
 * (`../capabilities/timelines.ts`).
 */
export class GetTimelineVersionTool extends CapabilityTool {
  constructor() {
    super(getTimelineVersion.spec, getTimelineVersion.impl, timelineRun);
  }
}

/**
 * @deprecated Ported to the `timelines` capability module
 * (`../capabilities/timelines.ts`).
 */
export class CreateTimelineVersionTool extends CapabilityTool {
  constructor() {
    super(createTimelineVersion.spec, createTimelineVersion.impl, timelineRun);
  }
}

/**
 * @deprecated Ported to the `timelines` capability module
 * (`../capabilities/timelines.ts`).
 */
export class RestoreTimelineVersionTool extends CapabilityTool {
  constructor() {
    super(restoreTimelineVersion.spec, restoreTimelineVersion.impl, timelineRun);
  }
}

/** Every tool in this module, for toolbelt assembly and docs. */
export const TIMELINE_VERSION_TOOL_NAMES = [
  "list_timelines",
  "list_timeline_versions",
  "get_timeline_version",
  "create_timeline_version",
  "restore_timeline_version"
] as const;
