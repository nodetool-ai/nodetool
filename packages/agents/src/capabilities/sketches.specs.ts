/**
 * The `sketches` module's specs — data only, no implementation.
 *
 * Split out so a belt can be assembled synchronously: the registry's eager
 * spec table imports this file, never `sketches.ts`, so nothing the
 * implementations pull in reaches the entry graph. `sketches.ts` imports these
 * back and attaches each to its implementation, so there is one spec object
 * behind both halves.
 */

import type { CapabilitySpec } from "./types.js";
import type { JsonSchema } from "@nodetool-ai/runtime";

export const DEFAULT_VERSION_LIMIT = 20;

export const MAX_VERSION_LIMIT = 100;

export const SAVE_TYPE_PROPERTY = {
  type: "string" as const,
  enum: ["manual", "autosave", "restore"],
  description:
    "Only versions of this kind: 'manual' (a save someone asked for), " +
    "'autosave' (taken on a document write), 'restore' (the pre-restore " +
    "snapshot). Omit for all of them."
};

export const LIST_SKETCHES_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description:
        "Only sketches whose name contains this text (case-insensitive)."
    },
    limit: {
      type: "number",
      description: "Max sketches to return (default 20)."
    }
  }
};

export const LIST_SKETCH_VERSIONS_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    image_document_id: {
      type: "string",
      description: "Sketch (image document) id."
    },
    save_type: SAVE_TYPE_PROPERTY,
    limit: {
      type: "number",
      description: `Max versions to return (default ${DEFAULT_VERSION_LIMIT}, max ${MAX_VERSION_LIMIT}).`
    }
  },
  required: ["image_document_id"]
};

export const GET_SKETCH_VERSION_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    image_document_id: {
      type: "string",
      description: "Sketch (image document) id."
    },
    version: {
      type: "number",
      description: "Version number to read, from list_sketch_versions."
    }
  },
  required: ["image_document_id", "version"]
};

export const CREATE_SKETCH_VERSION_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    image_document_id: {
      type: "string",
      description: "Sketch (image document) id."
    },
    name: {
      type: "string",
      description: "Label for the snapshot, e.g. 'before the repaint'."
    }
  },
  required: ["image_document_id"]
};

export const RESTORE_SKETCH_VERSION_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    image_document_id: {
      type: "string",
      description: "Sketch (image document) id."
    },
    version: {
      type: "number",
      description: "Version number to restore, from list_sketch_versions."
    }
  },
  required: ["image_document_id", "version"]
};

export const EDIT_SKETCH_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    image_document_id: {
      type: "string",
      description: "Sketch (image document) id."
    },
    ops: {
      type: "array",
      description:
        'Operations in order. Each is {"op": <name>, ...arguments}: ' +
        'add_layer {name?, type?: "raster"|"mask", index?}, ' +
        "remove_layer {target}, rename_layer {target, name}, " +
        "set_layer_props {target, visible?, locked?, opacity?, blendMode?}, " +
        "reorder_layer {target, index}, duplicate_layer {target}, " +
        "select_layer {target}, resize_canvas {width, height}. " +
        '`target` is a layer id, its name, or "active". Layer index 0 is the ' +
        "bottom layer.",
      items: { type: "object" }
    }
  },
  required: ["image_document_id", "ops"]
};

export const VALIDATE_SKETCH_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    image_document_id: {
      type: "string",
      description: "The ID of a saved sketch (image document) to validate"
    },
    document: {
      type: "object",
      description:
        "Inline ImageDocumentData to validate ({ sketch, layerBindings }). " +
        "Takes precedence over image_document_id."
    },
    width: {
      type: "number",
      description:
        "Canvas width the inline document is stored against. The canvas " +
        "size lives on the row, not in the document, so without it a " +
        "mismatch between the two cannot be reported. Ignored for " +
        "image_document_id."
    },
    height: {
      type: "number",
      description:
        "Canvas height the inline document is stored against. Ignored for image_document_id."
    },
    background_color: {
      type: "string",
      description:
        "Canvas background color the inline document is stored against. Ignored for image_document_id."
    }
  }
};

export const listSketchesSpec: CapabilitySpec = {
  name: "list_sketches",
  description:
    "List the caller's sketches (image documents), most recently updated " +
    "first: id, name, canvas size, and when it last changed. Start here when " +
    "the user names a sketch but not its id.",
  inputSchema: LIST_SKETCHES_SCHEMA,
  category: "read",
  userMessage: () => "Listing sketches"
};

export const CREATE_SKETCH_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    name: {
      type: "string",
      description: "Name of the new sketch."
    },
    width: {
      type: "number",
      description: "Canvas width in pixels (default 1024)."
    },
    height: {
      type: "number",
      description: "Canvas height in pixels (default 1024)."
    },
    background_color: {
      type: "string",
      description: "Canvas background color (default #ffffff)."
    },
    project_id: {
      type: "string",
      description: "Project to create the sketch in (default 'default')."
    },
    id: {
      type: "string",
      description:
        "Optional id. If a sketch with this id already exists and you " +
        "own it, that row is returned instead of creating a duplicate."
    }
  },
  required: ["name"]
};

export const createSketchSpec: CapabilitySpec = {
  name: "create_sketch",
  description:
    "Create a blank sketch (image document) and return its id. This is the " +
    "first step of drawing one headlessly: create it, then add and arrange " +
    "layers with edit_sketch. An open editor picks the new document up once " +
    "you open it. Pixels stay empty — painting and generation happen in an " +
    "open editor or a workflow run.",
  inputSchema: CREATE_SKETCH_SCHEMA,
  category: "write",
  userMessage: (params) => {
    const name = params["name"];
    return typeof name === "string" && name.trim()
      ? `Creating sketch ${name}`
      : "Creating sketch";
  }
};

export const listSketchVersionsSpec: CapabilitySpec = {
  name: "list_sketch_versions",
  description:
    "List a sketch's whole-document snapshots, newest first: version number, " +
    "name, save type ('manual', 'autosave', 'restore'), canvas settings, and " +
    "when it was taken. These are document snapshots, not the per-layer " +
    "generation history. Call this before restoring — restore_sketch_version " +
    "addresses a snapshot by its version number.",
  inputSchema: LIST_SKETCH_VERSIONS_SCHEMA,
  category: "read",
  userMessage: (params) =>
    `Listing versions of sketch ${String(params["image_document_id"])}`
};

export const getSketchVersionSpec: CapabilitySpec = {
  name: "get_sketch_version",
  description:
    "Read one snapshot of a sketch without restoring it: the version's " +
    "metadata plus the full document it stored. Use this to inspect or " +
    "compare versions before deciding which one to restore.",
  inputSchema: GET_SKETCH_VERSION_SCHEMA,
  category: "read",
  userMessage: (params) =>
    `Reading v${String(params["version"])} of sketch ${String(params["image_document_id"])}`
};

export const createSketchVersionSpec: CapabilitySpec = {
  name: "create_sketch_version",
  description:
    "Snapshot a sketch's current document as a manual version, so it can be " +
    "restored later. Manual snapshots are never pruned (autosaves are), so " +
    "take one before an edit the user may want undone. Returns the new " +
    "version's number.",
  inputSchema: CREATE_SKETCH_VERSION_SCHEMA,
  category: "write",
  userMessage: (params) =>
    `Snapshotting sketch ${String(params["image_document_id"])}`
};

export const restoreSketchVersionSpec: CapabilitySpec = {
  name: "restore_sketch_version",
  description:
    "Roll a sketch's document and canvas settings back to one of its " +
    "snapshots, addressed by version number (from list_sketch_versions). The " +
    "state being overwritten is snapshotted first, so the restore is itself " +
    "undoable — restore that snapshot to come back. An old document is " +
    "restored against today's schema, so the result is validated afterwards " +
    "and the findings are returned with it.",
  inputSchema: RESTORE_SKETCH_VERSION_SCHEMA,
  category: "write",
  userMessage: (params) =>
    `Restoring sketch ${String(params["image_document_id"])} to v${String(params["version"])}`
};

export const editSketchSpec: CapabilitySpec = {
  name: "edit_sketch",
  description:
    "Edit a saved sketch's layer structure headlessly: add, remove, rename, " +
    "reorder and duplicate layers, set visibility/lock/opacity/blend mode, " +
    "choose the active layer, and resize the canvas. Operations run in order " +
    "against the stored document and the result is saved; an open editor " +
    "picks the change up live. Pixels are never read or written — painting " +
    "and generation happen in an open editor or a workflow run. Call " +
    "list_sketches to find one and validate_sketch afterwards.",
  inputSchema: EDIT_SKETCH_SCHEMA,
  category: "write",
  userMessage: (params) => {
    const count = Array.isArray(params["ops"]) ? params["ops"].length : 0;
    return `Editing sketch ${String(params["image_document_id"])} (${count} ops)`;
  }
};

export const validateSketchSpec: CapabilitySpec = {
  name: "validate_sketch",
  description:
    "Statically validate a sketch (image document) WITHOUT rendering it: " +
    "duplicate layer ids, an active or mask layer the stack lacks, unknown " +
    "blend modes, opacities and transforms that cannot render, generation " +
    "bindings pointing at missing layers, unknown binding kinds and statuses, " +
    "canvas settings that disagree with the stored ones, and fields a schema " +
    "round trip would strip. Pass an inline `document` to check one you are " +
    "building, or `image_document_id` to validate a saved sketch. Run it after " +
    "sketch edits and before handing the document back.",
  inputSchema: VALIDATE_SKETCH_SCHEMA,
  category: "read",
  userMessage: (params) =>
    params["image_document_id"]
      ? `Validating sketch ${params["image_document_id"]}`
      : "Validating sketch document"
};

export const deleteSketchSpec: CapabilitySpec = {
  name: "delete_sketch",
  description:
    "Delete a sketch you own, together with its saved version history. " +
    "This cannot be undone. A sketch belonging to another user is reported " +
    "as missing.",
  inputSchema: {
    type: "object",
    properties: {
      image_document_id: {
        type: "string",
        description: "The sketch to delete. You must own it."
      }
    },
    required: ["image_document_id"]
  },
  category: "write",
  userMessage: (params) => `Deleting sketch ${params["image_document_id"]}`
};

/** Every spec this module declares, in declaration order. */
export const sketchesSpecs: readonly CapabilitySpec[] = [
  listSketchesSpec,
  createSketchSpec,
  listSketchVersionsSpec,
  getSketchVersionSpec,
  createSketchVersionSpec,
  restoreSketchVersionSpec,
  editSketchSpec,
  validateSketchSpec,
  deleteSketchSpec
];
