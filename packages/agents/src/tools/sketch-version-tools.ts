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
 *   create_sketch_version  — pin the current state as a manual snapshot
 *   restore_sketch_version — roll the document back to one
 *
 * The restore mirrors `sketch.documentVersions.restore`: it snapshots what is
 * about to be overwritten, then compare-and-swaps the old document and canvas
 * settings back onto the row. An old document is restored against today's
 * schema, so what it used to pass is not what it passes now — the restore ends
 * with `validateSketchDocument` over the result, the same check the CLI's
 * `sketch versions restore` makes.
 *
 * Per-layer generation history (`sketch.versions.*`) is a different thing:
 * those record one generated image on one layer, these snapshot the document.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import { ImageDocument, ImageDocumentVersion } from "@nodetool-ai/models";
import { validateSketchDocument } from "@nodetool-ai/execution/sketch-debug";
import type { SketchValidation } from "@nodetool-ai/execution/sketch-debug";
import { Tool } from "./base-tool.js";

/** Versions one call may return, so a long history cannot flood the context. */
const DEFAULT_VERSION_LIMIT = 20;
const MAX_VERSION_LIMIT = 100;

type ToolError = { error: string };

const isError = (value: unknown): value is ToolError =>
  !!value &&
  typeof value === "object" &&
  typeof (value as ToolError).error === "string";

async function loadSketch(
  context: ProcessingContext,
  sketchId: unknown
): Promise<ImageDocument | ToolError> {
  if (typeof sketchId !== "string" || !sketchId) {
    return {
      error:
        "image_document_id is required (use list_sketches to find one)."
    };
  }
  const doc = await ImageDocument.findById(sketchId);
  // A sketch owned by someone else reads as missing — the same rule the tRPC
  // router's ownership check applies.
  if (!doc || doc.user_id !== context.userId) {
    return { error: `Sketch ${sketchId} was not found.` };
  }
  return doc;
}

/** The list-item shape the tRPC router returns for a snapshot. */
function toVersionListItem(version: ImageDocumentVersion) {
  return {
    id: version.id,
    version: version.version,
    name: version.name,
    saveType: version.save_type,
    width: version.width,
    height: version.height,
    backgroundColor: version.background_color,
    createdAt: version.created_at
  };
}

/**
 * A snapshot's document is JSON text on SQLite and an object on Postgres, so
 * parse only when it is a string. A row that is neither is corrupt, and saying
 * so beats handing back a string the caller will treat as a document.
 */
function parseVersionDocument(raw: unknown): unknown | ToolError {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return { error: "The stored version document is not valid JSON." };
  }
}

/** One-line count of what the post-restore validation found. */
function validationSummary(validation: SketchValidation): string {
  const errors = validation.errors.length;
  const warnings = validation.warnings.length;
  if (errors === 0 && warnings === 0) return "No issues found.";
  const parts: string[] = [];
  if (errors > 0) parts.push(`${errors} error${errors === 1 ? "" : "s"}`);
  if (warnings > 0)
    parts.push(`${warnings} warning${warnings === 1 ? "" : "s"}`);
  return parts.join(", ");
}

function versionNumber(value: unknown): number | ToolError {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    return {
      error:
        "version must be a positive integer (use list_sketch_versions to see the available ones)."
    };
  }
  return n;
}

const SAVE_TYPE_PROPERTY = {
  type: "string" as const,
  enum: ["manual", "autosave", "restore"],
  description:
    "Only versions of this kind: 'manual' (a save someone asked for), " +
    "'autosave' (taken on a document write), 'restore' (the pre-restore " +
    "snapshot). Omit for all of them."
};

export class ListSketchesTool extends Tool {
  readonly name = "list_sketches";
  readonly description =
    "List the caller's sketches (image documents), most recently updated " +
    "first: id, name, canvas size, and when it last changed. Start here when " +
    "the user names a sketch but not its id.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      query: {
        type: "string" as const,
        description: "Only sketches whose name contains this text (case-insensitive)."
      },
      limit: {
        type: "number" as const,
        description: "Max sketches to return (default 20)."
      }
    }
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    if (!context.userId) return { error: "No user is bound to this session." };
    const limit = Math.max(1, Math.min(Number(params["limit"]) || 20, 100));
    const query =
      typeof params["query"] === "string"
        ? params["query"].trim().toLowerCase()
        : "";
    // Filter after the read: the name filter is not indexed, and the per-user
    // limit is what bounds the scan.
    const rows = await ImageDocument.listByUser(context.userId, 100);
    const matching = query
      ? rows.filter((row) => row.name.toLowerCase().includes(query))
      : rows;
    return {
      sketches: matching.slice(0, limit).map((row) => ({
        id: row.id,
        name: row.name,
        width: row.width,
        height: row.height,
        updated_at: row.updated_at
      }))
    };
  }

  userMessage(): string {
    return "Listing sketches";
  }
}

export class ListSketchVersionsTool extends Tool {
  readonly name = "list_sketch_versions";
  readonly description =
    "List a sketch's whole-document snapshots, newest first: version number, " +
    "name, save type ('manual', 'autosave', 'restore'), canvas settings, and " +
    "when it was taken. These are document snapshots, not the per-layer " +
    "generation history. Call this before restoring — restore_sketch_version " +
    "addresses a snapshot by its version number.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      image_document_id: {
        type: "string" as const,
        description: "Sketch (image document) id."
      },
      save_type: SAVE_TYPE_PROPERTY,
      limit: {
        type: "number" as const,
        description: `Max versions to return (default ${DEFAULT_VERSION_LIMIT}, max ${MAX_VERSION_LIMIT}).`
      }
    },
    required: ["image_document_id"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const doc = await loadSketch(context, params["image_document_id"]);
    if (isError(doc)) return doc;

    const limit = Math.max(
      1,
      Math.min(Number(params["limit"]) || DEFAULT_VERSION_LIMIT, MAX_VERSION_LIMIT)
    );
    const saveType =
      typeof params["save_type"] === "string"
        ? (params["save_type"] as string)
        : undefined;
    const versions = await ImageDocumentVersion.listForDocument(doc.id, {
      limit,
      saveType
    });
    return {
      image_document_id: doc.id,
      name: doc.name,
      versions: versions.map(toVersionListItem)
    };
  }

  userMessage(params: Record<string, unknown>): string {
    return `Listing versions of sketch ${String(params["image_document_id"])}`;
  }
}

export class CreateSketchVersionTool extends Tool {
  readonly name = "create_sketch_version";
  readonly description =
    "Snapshot a sketch's current document as a manual version, so it can be " +
    "restored later. Manual snapshots are never pruned (autosaves are), so " +
    "take one before an edit the user may want undone. Returns the new " +
    "version's number.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      image_document_id: {
        type: "string" as const,
        description: "Sketch (image document) id."
      },
      name: {
        type: "string" as const,
        description: "Label for the snapshot, e.g. 'before the repaint'."
      }
    },
    required: ["image_document_id"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const doc = await loadSketch(context, params["image_document_id"]);
    if (isError(doc)) return doc;

    const name =
      typeof params["name"] === "string" && params["name"]
        ? (params["name"] as string)
        : null;
    const version = await ImageDocumentVersion.snapshot(doc, {
      saveType: "manual",
      name
    });
    return {
      ok: true,
      image_document_id: doc.id,
      ...toVersionListItem(version)
    };
  }

  userMessage(params: Record<string, unknown>): string {
    return `Snapshotting sketch ${String(params["image_document_id"])}`;
  }
}

export class RestoreSketchVersionTool extends Tool {
  readonly name = "restore_sketch_version";
  readonly description =
    "Roll a sketch's document and canvas settings back to one of its " +
    "snapshots, addressed by version number (from list_sketch_versions). The " +
    "state being overwritten is snapshotted first, so the restore is itself " +
    "undoable — restore that snapshot to come back. An old document is " +
    "restored against today's schema, so the result is validated afterwards " +
    "and the findings are returned with it.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      image_document_id: {
        type: "string" as const,
        description: "Sketch (image document) id."
      },
      version: {
        type: "number" as const,
        description: "Version number to restore, from list_sketch_versions."
      }
    },
    required: ["image_document_id", "version"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const doc = await loadSketch(context, params["image_document_id"]);
    if (isError(doc)) return doc;

    const number = versionNumber(params["version"]);
    if (isError(number)) return number;

    const version = await ImageDocumentVersion.findByVersion(doc.id, number);
    if (!version) {
      return {
        error: `Sketch ${doc.id} has no version ${number}. Call list_sketch_versions to see the available ones.`
      };
    }

    const document = parseVersionDocument(version.document);
    if (isError(document)) return document;

    // Snapshot what is about to be overwritten first, so a restore is itself
    // undoable.
    const undo = await ImageDocumentVersion.snapshot(doc, {
      saveType: "restore",
      name: `Before restore to v${number}`
    });

    const updated = await ImageDocument.updateFieldsIfUnchanged(
      doc.id,
      doc.updated_at,
      {
        document: JSON.stringify(document),
        width: version.width,
        height: version.height,
        background_color: version.background_color
      }
    );
    if (!updated) {
      return {
        error: `Sketch ${doc.id} was modified since it was read (optimistic concurrency conflict); nothing was restored. Retry the call.`,
        undo_version: undo.version
      };
    }

    const validation = validateSketchDocument(document, {
      width: version.width,
      height: version.height,
      backgroundColor: version.background_color
    });

    return {
      ok: true,
      image_document_id: doc.id,
      restored_version: number,
      undo_version: undo.version,
      width: updated.width,
      height: updated.height,
      backgroundColor: updated.background_color,
      updated_at: updated.updated_at,
      validation,
      summary: validationSummary(validation)
    };
  }

  userMessage(params: Record<string, unknown>): string {
    return `Restoring sketch ${String(params["image_document_id"])} to v${String(params["version"])}`;
  }
}

/** Every tool in this module, for toolbelt assembly and docs. */
export const SKETCH_VERSION_TOOL_NAMES = [
  "list_sketches",
  "list_sketch_versions",
  "create_sketch_version",
  "restore_sketch_version"
] as const;
