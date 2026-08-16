/**
 * `nodetool sketch versions` — the version-history half of the sketch
 * commands.
 *
 * Image documents keep immutable snapshots: manual saves, autosaves the server
 * writes at most every five minutes, and the pre-restore snapshot that makes a
 * restore undoable. These commands read and write that history directly
 * against the local database, so an agent can inspect, snapshot, restore and
 * prune without a server.
 *
 * `restore` mirrors the tRPC router (`sketch.documentVersions.restore`):
 * snapshot what is about to be overwritten, then CAS-write the version's
 * document and canvas settings back onto the image document, then run the same
 * static check `sketch validate` runs. An old document is restored against
 * today's schema, so what it used to pass is not what it passes now — a
 * restore whose document no longer validates exits non-zero and prints the
 * issues.
 *
 * The database and the validator core are injected with lazy defaults, so
 * registration stays light and the actions are unit-testable.
 */
import type { Command } from "commander";
import type { SketchValidation } from "@nodetool-ai/execution/sketch-debug";
import { printCommandError } from "../command-errors.js";
import { asJson, confirm, printTable } from "./output.js";
import { numericOptionParser } from "../numeric-options.js";
import { renderSketchValidation } from "./sketch-validation-output.js";

/** A decoded JSON document, before anything validates its shape. */
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

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

/** The model calls these commands make — the whole database seam. */
export interface SketchVersionStore {
  loadDocument: (id: string) => Promise<ImageDocumentRow | null>;
  listVersions: (
    imageDocumentId: string,
    opts: { limit?: number; saveType?: string }
  ) => Promise<SketchVersionRow[]>;
  findVersion: (
    imageDocumentId: string,
    version: number
  ) => Promise<SketchVersionRow | null>;
  snapshot: (
    doc: ImageDocumentRow,
    opts: { saveType: "manual" | "restore"; name?: string | null }
  ) => Promise<SketchVersionRow>;
  /**
   * Write a version's document and canvas settings back onto the image
   * document, compare-and-swap on the `updated_at` it was loaded with.
   * Resolves to null when someone else wrote first.
   */
  restore: (
    doc: ImageDocumentRow,
    version: SketchVersionRow
  ) => Promise<ImageDocumentRow | null>;
  deleteVersion: (imageDocumentId: string, version: number) => Promise<void>;
}

export interface SketchVersionsDeps {
  /** Defaults to the local database through `@nodetool-ai/models`. */
  store?: () => Promise<SketchVersionStore>;
  /** Defaults to `validateSketchDocument` from the sketch-debug core. */
  validate?: (
    document: unknown,
    meta: { width?: number; height?: number; backgroundColor?: string }
  ) => Promise<SketchValidation> | SketchValidation;
  /** Defaults to the interactive prompt in `output.ts`. */
  confirmDelete?: (message: string, force?: boolean) => Promise<boolean>;
}

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
  return items.map((v) => ({
    version: v.version,
    saveType: v.saveType,
    name: v.name ?? "",
    createdAt: v.createdAt,
    resolution: `${v.width}x${v.height}`,
    background: v.backgroundColor
  }));
}

/** Parse a stored document without throwing — an unreadable one is a finding. */
export function parseVersionDocument(raw: unknown): JsonValue {
  // SAFETY: a Postgres json column arrives already decoded; either way the
  // stored document is JSON.
  if (typeof raw !== "string") return raw as JsonValue;
  try {
    return JSON.parse(raw) as JsonValue;
  } catch {
    return raw;
  }
}

/** Layer and binding counts of whatever a version stored. */
export function documentCounts(document: JsonValue | undefined) {
  const doc = (document ?? {}) as Record<string, unknown>;
  const sketch = (doc.sketch ?? {}) as Record<string, unknown>;
  const count = (value: unknown): number =>
    Array.isArray(value) ? value.length : 0;
  return {
    layers: count(sketch.layers),
    bindings: count(doc.layerBindings)
  };
}

async function defaultValidate(
  document: unknown,
  meta: { width?: number; height?: number; backgroundColor?: string }
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
    loadDocument: async (id) =>
      (await ImageDocument.findById(id)),
    listVersions: async (imageDocumentId, opts) =>
      (await ImageDocumentVersion.listForDocument(
        imageDocumentId,
        opts
      )),
    findVersion: async (imageDocumentId, version) =>
      (await ImageDocumentVersion.findByVersion(
        imageDocumentId,
        version
      )),
    snapshot: async (doc, opts) =>
      await ImageDocumentVersion.snapshot(doc, opts),
    restore: async (doc, version) =>
      (await ImageDocument.updateFieldsIfUnchanged(doc.id, doc.updated_at, {
        document: version.document,
        width: version.width,
        height: version.height,
        background_color: version.background_color
      })),
    deleteVersion: async (imageDocumentId, version) => {
      const row = await ImageDocumentVersion.findByVersion(
        imageDocumentId,
        version
      );
      if (row) await row.delete();
    }
  };
}

/** Load a document or say which id was not found. */
async function requireDocument(
  store: SketchVersionStore,
  id: string
): Promise<ImageDocumentRow> {
  const doc = await store.loadDocument(id);
  if (!doc) throw new Error(`Image document not found: ${id}`);
  return doc;
}

async function requireVersion(
  store: SketchVersionStore,
  imageDocumentId: string,
  version: number
): Promise<SketchVersionRow> {
  const row = await store.findVersion(imageDocumentId, version);
  if (!row) {
    throw new Error(`Sketch version not found: ${imageDocumentId} v${version}`);
  }
  return row;
}

interface JsonOption {
  json?: boolean;
}

interface ListOptions extends JsonOption {
  saveType?: string;
  limit?: number;
}

export function registerSketchVersionsCommands(
  sketch: Command,
  deps: SketchVersionsDeps = {}
): void {
  const openStore = deps.store ?? defaultStore;
  const validate = deps.validate ?? defaultValidate;
  const confirmDelete =
    deps.confirmDelete ??
    ((message: string, force?: boolean) => confirm(message, { force }));

  const versions = sketch
    .command("versions")
    .description(
      "Inspect and restore the snapshot history of an image document (manual saves, autosaves, pre-restore snapshots)"
    );

  versions
    .command("list <image_document_id>")
    .description("List a sketch's versions, newest first")
    .option("--save-type <type>", "Only manual, autosave or restore snapshots")
    .option(
      "--limit <n>",
      "Maximum versions to list (default 100)",
      numericOptionParser("--limit", { integer: true, min: 1 })
    )
    .option("--json", "Print the versions as JSON")
    .action(async (documentId: string, opts: ListOptions) => {
      try {
        const store = await openStore();
        await requireDocument(store, documentId);
        const query: Parameters<typeof store.listVersions>[1] = {};
        if (opts.limit !== undefined) {
          query.limit = opts.limit;
        }
        if (opts.saveType) {
          query.saveType = opts.saveType;
        }
        const rows = await store.listVersions(documentId, query);
        const items = rows.map(toVersionListItem);

        if (opts.json) {
          asJson({ imageDocumentId: documentId, versions: items });
          return;
        }
        printTable(versionTableRows(items));
      } catch (e) {
        printCommandError(e, opts.json);
        process.exit(1);
      }
    });

  versions
    .command("show <image_document_id> <version>")
    .description("Print one version's metadata and the document it stored")
    .option("--json", "Print the metadata and the full document as JSON")
    .action(async (documentId: string, version: string, opts: JsonOption) => {
      try {
        const number = parseVersionNumber(version);
        const store = await openStore();
        await requireDocument(store, documentId);
        const row = await requireVersion(store, documentId, number);
        const item = toVersionListItem(row);
        const document = parseVersionDocument(row.document);

        if (opts.json) {
          asJson({ ...item, document });
          return;
        }
        const counts = documentCounts(document);
        printTable([
          {
            version: item.version,
            saveType: item.saveType,
            name: item.name ?? "",
            createdAt: item.createdAt,
            resolution: `${item.width}x${item.height}`,
            background: item.backgroundColor
          }
        ]);
        console.log(
          `\n  ${counts.layers} layer(s), ${counts.bindings} binding(s)`
        );
      } catch (e) {
        printCommandError(e, opts.json);
        process.exit(1);
      }
    });

  versions
    .command("create <image_document_id>")
    .description("Snapshot the sketch as it stands now (a manual save)")
    .option("--name <name>", "Label for the snapshot")
    .option("--json", "Print the created version as JSON")
    .action(
      async (documentId: string, opts: JsonOption & { name?: string }) => {
        try {
          const store = await openStore();
          const doc = await requireDocument(store, documentId);
          const row = await store.snapshot(doc, {
            saveType: "manual",
            name: opts.name ?? null
          });
          const item = toVersionListItem(row);

          if (opts.json) {
            asJson(item);
            return;
          }
          console.log(
            `✅ Snapshot saved as v${item.version}${item.name ? ` (${item.name})` : ""}`
          );
        } catch (e) {
          printCommandError(e, opts.json);
          process.exit(1);
        }
      }
    );

  versions
    .command("restore <image_document_id> <version>")
    .description(
      "Restore a version onto the sketch. The pre-restore state is snapshotted first, and the restored document is validated against the current schema — a restore whose document no longer validates exits non-zero"
    )
    .option("--json", "Print the restore result as JSON")
    .action(async (documentId: string, version: string, opts: JsonOption) => {
      // The verdict leaves the try block in a variable: `process.exit` throws
      // under test, and an exit inside the try would be caught here as a
      // command failure.
      let restoredOk = false;
      try {
        const number = parseVersionNumber(version);
        const store = await openStore();
        const doc = await requireDocument(store, documentId);
        const target = await requireVersion(store, documentId, number);

        // Snapshot what is about to be overwritten first, so the restore is
        // itself undoable — same order the tRPC router uses.
        const backup = await store.snapshot(doc, {
          saveType: "restore",
          name: `Before restore to v${number}`
        });

        const updated = await store.restore(doc, target);
        if (!updated) {
          throw new Error("Document was modified since last read");
        }

        const document = parseVersionDocument(target.document);
        const validation = await validate(document, {
          width: target.width,
          height: target.height,
          backgroundColor: target.background_color
        });

        if (opts.json) {
          asJson({
            imageDocumentId: documentId,
            restored: toVersionListItem(target),
            snapshot: toVersionListItem(backup),
            document: {
              id: updated.id,
              width: updated.width,
              height: updated.height,
              backgroundColor: updated.background_color
            },
            validation
          });
        } else {
          const counts = documentCounts(document);
          console.log(
            `✅ Restored v${number} onto ${documentId}: ${counts.layers} layer(s), ${counts.bindings} binding(s), ${target.width}x${target.height} on ${target.background_color}`
          );
          console.log(
            `  pre-restore state saved as v${backup.version} (${backup.save_type})`
          );
          console.log(renderSketchValidation(validation).join("\n"));
        }
        restoredOk = validation.ok;
      } catch (e) {
        printCommandError(e, opts.json);
        process.exit(1);
      }
      process.exit(restoredOk ? 0 : 1);
    });

  versions
    .command("delete <image_document_id> <version>")
    .description("Delete one version from a sketch's history")
    .option("-y, --yes", "Skip the confirmation prompt")
    .option("--json", "Print the result as JSON")
    .action(
      async (
        documentId: string,
        version: string,
        opts: JsonOption & { yes?: boolean }
      ) => {
        let aborted = false;
        try {
          const number = parseVersionNumber(version);
          const store = await openStore();
          await requireDocument(store, documentId);
          await requireVersion(store, documentId, number);

          const ok = await confirmDelete(
            `Delete v${number} of sketch ${documentId}?`,
            opts.yes
          );
          if (!ok) {
            aborted = true;
            if (opts.json) {
              asJson({
                imageDocumentId: documentId,
                version: number,
                deleted: false,
                aborted: true
              });
            } else {
              console.error("Aborted.");
            }
          } else {
            await store.deleteVersion(documentId, number);
            if (opts.json) {
              asJson({
                imageDocumentId: documentId,
                version: number,
                deleted: true
              });
            } else {
              console.log(`✅ Deleted v${number} of sketch ${documentId}`);
            }
          }
        } catch (e) {
          printCommandError(e, opts.json);
          process.exit(1);
        }
        if (aborted) process.exit(1);
      }
    );
}

/** A version is a positive integer; anything else names itself in the error. */
export function parseVersionNumber(raw: string): number {
  const value = Number(raw.trim());
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`version must be a positive integer (got "${raw}")`);
  }
  return value;
}
