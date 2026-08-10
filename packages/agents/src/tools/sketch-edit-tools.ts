/**
 * Sketch edit tool — restructure a saved image document without a browser.
 *
 * Layer structure was browser-only: the `ui_sketch_*` tools round-trip over
 * the WebSocket into the open editor's canvas stores, so an agent working
 * headlessly could snapshot and roll a sketch back but never add a layer,
 * reorder one, or change its blend mode.
 *
 * The implementation moved to the `sketches` capability module
 * (`../capabilities/sketches.ts`); the class below is a thin wrapper over it.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  CapabilityTool,
  UNGATED,
  createCapabilityRun
} from "../capabilities/index.js";
import { editSketch } from "../capabilities/sketches.js";

/**
 * @deprecated Ported to the `sketches` capability module
 * (`../capabilities/sketches.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class EditSketchTool extends CapabilityTool {
  constructor() {
    super(editSketch.spec, editSketch.impl, (context: ProcessingContext) =>
      createCapabilityRun({ context, gate: UNGATED })
    );
  }
}
