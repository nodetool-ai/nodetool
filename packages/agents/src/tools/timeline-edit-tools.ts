/**
 * Timeline edit tool — cut a saved sequence without a browser.
 *
 * Every structural edit the timeline surface offers lived behind the
 * `ui_timeline_*` tools, which only work while that sequence is open in a
 * browser: the call round-trips over the WebSocket into the editor's Zustand
 * stores. An agent working headlessly (chat, CLI, MCP) could read a cut and
 * roll it back through the version tools, but not change one.
 *
 * The implementation moved to the `timelines` capability module
 * (`../capabilities/timelines.ts`); the class below is a thin wrapper over it.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  CapabilityTool,
  UNGATED,
  createCapabilityRun
} from "../capabilities/index.js";
import { editTimeline } from "../capabilities/timelines.js";

/**
 * @deprecated Ported to the `timelines` capability module
 * (`../capabilities/timelines.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class EditTimelineTool extends CapabilityTool {
  constructor() {
    super(editTimeline.spec, editTimeline.impl, (context: ProcessingContext) =>
      createCapabilityRun({ context, gate: UNGATED })
    );
  }
}
