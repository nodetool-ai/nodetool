/**
 * `nodetool sketch versions` — the version-history half of the sketch
 * commands. The commands themselves live in `version-commands.ts`; this file
 * is the image document's row shapes, database seam, columns and messages.
 *
 * Image documents keep immutable snapshots: manual saves, autosaves the server
 * writes at most every five minutes, and the pre-restore snapshot that makes a
 * restore undoable. The history is read and written directly against the local
 * database, so an agent can work without a server.
 */
import type { Command } from "commander";
import type { SketchValidation } from "@nodetool-ai/execution/sketch-debug";
import { renderSketchValidation } from "./sketch-validation-output.js";
import {
  countArray,
  registerVersionCommands,
  type JsonValue,
  type VersionCommandDeps,
  type VersionCommandSpec,
  type VersionStore
} from "./version-commands.js";

export { parseVersionDocument, parseVersionNumber } from "./version-commands.js";

/** An `image_documents` row as these commands need it. */
export interface ImageDocumentRow {
  id: string;
  user_id: string;
  name?: string | null;
  width: number;
  height: number;
  background_color: string;
  updated_at: string;
  document: string;
}

/** An `image_document_versions` row. */
export interface SketchVersionRow {
  id: string;
  image_document_id: string;
  version: number;
  name: string | null;
  save_type: string;
  width: number;
  height: number;
  background_color: string;
  created_at: string;
  document: string;
}

export type SketchVersionStore = VersionStore<
  ImageDocumentRow,
  SketchVersionRow
>;

/** The list-item shape, matching the tRPC router's `sketchVersionListItem`. */
export interface SketchVersionListItem {
  id: string;
  version: number;
  name: string | null;
  saveType: string;
  width: number;
  height: number;
  backgroundColor: string;
  createdAt: string;
}

export function toVersionListItem(
  row: SketchVersionRow
): SketchVersionListItem {
  return {
    id: row.id,
    version: row.version,
    name: row.name ?? null,
    saveType: row.save_type,
    width: row.width,
    height: row.height,
    backgroundColor: row.background_color,
    createdAt: row.created_at
  };
}

/** One table row per version: what it is, when it was taken, what it holds. */
export function versionTableRows(
  items: SketchVersionListItem[]
): Record<string, unknown>[] {
  return items.map(tableRow);
}

function tableRow(v: SketchVersionListItem): Record<string, unknown> {
  return {
    version: v.version,
    saveType: v.saveType,
    name: v.name ?? "",
    createdAt: v.createdAt,
    resolution: `${v.width}x${v.height}`,
    background: v.backgroundColor
  };
}

/** Layer and binding counts of whatever a version stored. */
export function documentCounts(document: JsonValue | undefined) {
  const doc = (document ?? {}) as Record<string, unknown>;
  const sketch = (doc.sketch ?? {}) as Record<string, unknown>;
  return {
    layers: countArray(sketch.layers),
    bindings: countArray(doc.layerBindings)
  };
}

interface SketchValidateMeta {
  width?: number;
  height?: number;
  backgroundColor?: string;
}

async function defaultValidate(
  document: unknown,
  meta: SketchValidateMeta
): Promise<SketchValidation> {
  const { validateSketchDocument } =
    await import("@nodetool-ai/execution/sketch-debug");
  return validateSketchDocument(document, meta);
}

async function defaultStore(): Promise<SketchVersionStore> {
  const { initDb, ImageDocument, ImageDocumentVersion } =
    await import("@nodetool-ai/models");
  const { getDefaultDbPath } = await import("@nodetool-ai/config");
  initDb(getDefaultDbPath());

  return {
    load: async (id) => await ImageDocument.findById(id),
    listVersions: async (imageDocumentId, opts) =>
      await ImageDocumentVersion.listForDocument(imageDocumentId, opts),
    findVersion: async (imageDocumentId, version) =>
      await ImageDocumentVersion.findByVersion(imageDocumentId, version),
    snapshot: async (doc, opts) =>
      await ImageDocumentVersion.snapshot(doc, opts),
    restore: async (doc, version) =>
      await ImageDocument.updateFieldsIfUnchanged(doc.id, doc.updated_at, {
        document: version.document,
        width: version.width,
        height: version.height,
        background_color: version.background_color
      }),
    deleteVersion: async (imageDocumentId, version) => {
      const row = await ImageDocumentVersion.findByVersion(
        imageDocumentId,
        version
      );
      if (row) await row.delete();
    }
  };
}

const spec: VersionCommandSpec<
  ImageDocumentRow,
  SketchVersionRow,
  SketchVersionListItem,
  SketchValidation,
  ReturnType<typeof documentCounts>,
  SketchValidateMeta
> = {
  idArg: "image_document_id",
  idKey: "imageDocumentId",
  descriptions: {
    group:
      "Inspect and restore the snapshot history of an image document (manual saves, autosaves, pre-restore snapshots)",
    list: "List a sketch's versions, newest first",
    show: "Print one version's metadata and the document it stored",
    create: "Snapshot the sketch as it stands now (a manual save)",
    restore:
      "Restore a version onto the sketch. The pre-restore state is snapshotted first, and the restored document is validated against the current schema — a restore whose document no longer validates exits non-zero",
    delete: "Delete one version from a sketch's history",
    restoreJson: "Print the restore result as JSON"
  },
  notFoundDocument: (id) => `Image document not found: ${id}`,
  notFoundVersion: (id, version) =>
    `Sketch version not found: ${id} v${version}`,
  conflict: "Document was modified since last read",
  confirmDelete: (id, version) => `Delete v${version} of sketch ${id}?`,
  deleted: (id, version) => `✅ Deleted v${version} of sketch ${id}`,
  toItem: toVersionListItem,
  tableRow,
  counts: documentCounts,
  showSummary: (counts) =>
    `\n  ${counts.layers} layer(s), ${counts.bindings} binding(s)`,
  restoreSummary: (id, version, counts, row) =>
    `✅ Restored v${version} onto ${id}: ${counts.layers} layer(s), ${counts.bindings} binding(s), ${row.width}x${row.height} on ${row.background_color}`,
  restoreJsonExtra: (doc) => ({
    document: {
      id: doc.id,
      width: doc.width,
      height: doc.height,
      backgroundColor: doc.background_color
    }
  }),
  validateMeta: (row) => ({
    width: row.width,
    height: row.height,
    backgroundColor: row.background_color
  }),
  renderValidation: renderSketchValidation
};

export type SketchVersionsDeps = VersionCommandDeps<
  ImageDocumentRow,
  SketchVersionRow,
  SketchValidation,
  SketchValidateMeta
>;

export function registerSketchVersionsCommands(
  sketch: Command,
  deps: SketchVersionsDeps = {}
): void {
  registerVersionCommands(sketch, spec, deps, {
    store: defaultStore,
    validate: defaultValidate
  });
}
