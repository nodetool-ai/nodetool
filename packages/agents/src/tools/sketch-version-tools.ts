/**
 * Sketch version tools — snapshot history for an image document, headlessly.
 *
 * The sketch editor keeps a whole-document history: manual saves, the autosaves
 * a document write takes at most every five minutes, and the pre-restore
 * snapshot that makes a restore undoable. Reading and moving through it was
 * tRPC-only, so an agent outside the browser could not roll a sketch back to a
 * version the user liked, or pin the current state before a risky edit.
 *
 *   list_sketches          — find a sketch to work on
 *   list_sketch_versions   — its snapshots, newest first
 *   get_sketch_version     — read one snapshot's document without restoring
 *   create_sketch_version  — pin the current state as a manual snapshot
 *   restore_sketch_version — roll the document back to one
 *
 * Per-layer generation history (`sketch.versions.*`) is a different thing:
 * those record one generated image on one layer, these snapshot the document.
 *
 * The implementations moved to the `sketches` capability module
 * (`../capabilities/sketches.ts`); the classes below are thin wrappers over
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
  createSketchVersion,
  getSketchVersion,
  listSketchVersions,
  listSketches,
  restoreSketchVersion
} from "../capabilities/sketches.js";

/** These capabilities need nothing per-run beyond the calling context. */
const sketchRun = (context: ProcessingContext): CapabilityRun =>
  createCapabilityRun({ context, gate: UNGATED });

/**
 * @deprecated Ported to the `sketches` capability module
 * (`../capabilities/sketches.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class ListSketchesTool extends CapabilityTool {
  constructor() {
    super(listSketches.spec, listSketches.impl, sketchRun);
  }
}

/**
 * @deprecated Ported to the `sketches` capability module
 * (`../capabilities/sketches.ts`).
 */
export class ListSketchVersionsTool extends CapabilityTool {
  constructor() {
    super(listSketchVersions.spec, listSketchVersions.impl, sketchRun);
  }
}

/**
 * @deprecated Ported to the `sketches` capability module
 * (`../capabilities/sketches.ts`).
 */
export class GetSketchVersionTool extends CapabilityTool {
  constructor() {
    super(getSketchVersion.spec, getSketchVersion.impl, sketchRun);
  }
}

/**
 * @deprecated Ported to the `sketches` capability module
 * (`../capabilities/sketches.ts`).
 */
export class CreateSketchVersionTool extends CapabilityTool {
  constructor() {
    super(createSketchVersion.spec, createSketchVersion.impl, sketchRun);
  }
}

/**
 * @deprecated Ported to the `sketches` capability module
 * (`../capabilities/sketches.ts`).
 */
export class RestoreSketchVersionTool extends CapabilityTool {
  constructor() {
    super(restoreSketchVersion.spec, restoreSketchVersion.impl, sketchRun);
  }
}

/** Every tool in this module, for toolbelt assembly and docs. */
export const SKETCH_VERSION_TOOL_NAMES = [
  "list_sketches",
  "list_sketch_versions",
  "get_sketch_version",
  "create_sketch_version",
  "restore_sketch_version"
] as const;
