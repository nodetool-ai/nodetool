/**
 * `<document> versions list|show|create|restore|delete` — one registration for
 * every document type that keeps immutable snapshots (timeline sequences,
 * image documents, JS scripts).
 *
 * Each type keeps its own row shapes, table columns and messages in a
 * `VersionCommandSpec`; the command wiring, the CAS-guarded restore order
 * (snapshot the pre-restore state, write, re-validate) and the exit codes are
 * written once here. `restore` mirrors the tRPC routers: an old document is
 * restored against today's schema, so a restore whose document no longer
 * validates exits non-zero.
 */
import type { Command } from "commander";
import { printCommandError } from "../command-errors.js";
import { asJson, confirm, printTable } from "./output.js";
import { numericOptionParser } from "../numeric-options.js";
import { isString } from "../predicates.js";

/** A decoded JSON document, before anything validates its shape. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** The model calls these commands make — the whole database seam. */
export interface VersionStore<Doc, Row> {
  load: (id: string) => Promise<Doc | null>;
  listVersions: (
    documentId: string,
    opts: { limit?: number; saveType?: string }
  ) => Promise<Row[]>;
  findVersion: (documentId: string, version: number) => Promise<Row | null>;
  snapshot: (
    doc: Doc,
    opts: { saveType: "manual" | "restore"; name?: string | null }
  ) => Promise<Row>;
  /**
   * Write a version's document and settings back onto the parent document,
   * compare-and-swap on the `updated_at` it was loaded with. Resolves to null
   * when someone else wrote first.
   */
  restore: (doc: Doc, version: Row) => Promise<Doc | null>;
  deleteVersion: (documentId: string, version: number) => Promise<void>;
}

interface Validation {
  ok: boolean;
}

/** Everything one document type contributes to the shared commands. */
export interface VersionCommandSpec<
  Doc,
  Row,
  Item,
  V extends Validation,
  Counts,
  Meta
> {
  /** Argument placeholder, e.g. `timeline_id`. */
  idArg: string;
  /** The key naming the parent document in `--json` output, e.g. `timelineId`. */
  idKey: string;
  /** Descriptions, verbatim — these are the documented CLI surface. */
  descriptions: {
    group: string;
    list: string;
    show: string;
    create: string;
    restore: string;
    delete: string;
    restoreJson: string;
  };
  notFoundDocument: (id: string) => string;
  notFoundVersion: (id: string, version: number) => string;
  /** Thrown when the CAS restore loses the race. */
  conflict: string;
  confirmDelete: (id: string, version: number) => string;
  deleted: (id: string, version: number) => string;
  toItem: (row: Row) => Item;
  /** The table columns, for `list` and for `show`'s header row. */
  tableRow: (item: Item) => Record<string, unknown>;
  counts: (document: JsonValue | undefined) => Counts;
  /** The line `show` prints under the table. */
  showSummary: (counts: Counts, item: Item) => string;
  /** The line `restore` prints on success. */
  restoreSummary: (
    id: string,
    version: number,
    counts: Counts,
    row: Row
  ) => string;
  /** Extra `--json` keys describing the document after a restore. */
  restoreJsonExtra: (doc: Doc) => Record<string, unknown>;
  /** The render settings the validator needs, read off the version row. */
  validateMeta: (row: Row) => Meta;
  renderValidation: (validation: V) => string[];
}

/** Injected with lazy defaults so registration stays light and actions unit-test. */
export interface VersionCommandDeps<Doc, Row, V extends Validation, Meta> {
  store?: () => Promise<VersionStore<Doc, Row>>;
  validate?: (document: unknown, meta: Meta) => Promise<V> | V;
  confirmDelete?: (message: string, force?: boolean) => Promise<boolean>;
}

/** A version is a positive integer; anything else names itself in the error. */
export function parseVersionNumber(raw: string): number {
  const value = Number(raw.trim());
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`version must be a positive integer (got "${raw}")`);
  }
  return value;
}

/** Parse a stored document without throwing — an unreadable one is a finding. */
export function parseVersionDocument(raw: unknown): JsonValue {
  // SAFETY: a Postgres json column arrives already decoded; either way the
  // stored document is JSON.
  if (!isString(raw)) return raw as JsonValue;
  try {
    return JSON.parse(raw) as JsonValue;
  } catch {
    return raw;
  }
}

/** Count an array-valued field, or 0 for anything else. */
export function countArray(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

interface JsonOption {
  json?: boolean;
}

interface ListOptions extends JsonOption {
  saveType?: string;
  limit?: number;
}

export function registerVersionCommands<
  Doc,
  Row,
  Item,
  V extends Validation,
  Counts,
  Meta
>(
  parent: Command,
  spec: VersionCommandSpec<Doc, Row, Item, V, Counts, Meta>,
  deps: VersionCommandDeps<Doc, Row, V, Meta>,
  defaults: {
    store: () => Promise<VersionStore<Doc, Row>>;
    validate: (document: unknown, meta: Meta) => Promise<V> | V;
  }
): void {
  const openStore = deps.store ?? defaults.store;
  const validate = deps.validate ?? defaults.validate;
  const confirmDelete =
    deps.confirmDelete ??
    ((message: string, force?: boolean) => confirm(message, { force }));

  const id = `<${spec.idArg}>`;

  async function requireDocument(
    store: VersionStore<Doc, Row>,
    documentId: string
  ): Promise<Doc> {
    const doc = await store.load(documentId);
    if (!doc) throw new Error(spec.notFoundDocument(documentId));
    return doc;
  }

  async function requireVersion(
    store: VersionStore<Doc, Row>,
    documentId: string,
    version: number
  ): Promise<Row> {
    const row = await store.findVersion(documentId, version);
    if (!row) throw new Error(spec.notFoundVersion(documentId, version));
    return row;
  }

  const versions = parent
    .command("versions")
    .description(spec.descriptions.group);

  versions
    .command(`list ${id}`)
    .description(spec.descriptions.list)
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
        const items = rows.map(spec.toItem);

        if (opts.json) {
          asJson({ [spec.idKey]: documentId, versions: items });
          return;
        }
        printTable(items.map(spec.tableRow));
      } catch (e) {
        printCommandError(e, opts.json);
        process.exit(1);
      }
    });

  versions
    .command(`show ${id} <version>`)
    .description(spec.descriptions.show)
    .option("--json", "Print the metadata and the full document as JSON")
    .action(async (documentId: string, version: string, opts: JsonOption) => {
      try {
        const number = parseVersionNumber(version);
        const store = await openStore();
        await requireDocument(store, documentId);
        const row = await requireVersion(store, documentId, number);
        const item = spec.toItem(row);
        const document = parseVersionDocument(
          (row as { document?: unknown }).document
        );

        if (opts.json) {
          asJson({ ...item, document });
          return;
        }
        printTable([spec.tableRow(item)]);
        console.log(spec.showSummary(spec.counts(document), item));
      } catch (e) {
        printCommandError(e, opts.json);
        process.exit(1);
      }
    });

  versions
    .command(`create ${id}`)
    .description(spec.descriptions.create)
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
          const item = spec.toItem(row) as { version: number; name?: unknown };

          if (opts.json) {
            asJson(item);
            return;
          }
          console.log(
            `✅ Snapshot saved as v${item.version}${item.name ? ` (${String(item.name)})` : ""}`
          );
        } catch (e) {
          printCommandError(e, opts.json);
          process.exit(1);
        }
      }
    );

  versions
    .command(`restore ${id} <version>`)
    .description(spec.descriptions.restore)
    .option("--json", spec.descriptions.restoreJson)
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
        if (!updated) throw new Error(spec.conflict);

        const document = parseVersionDocument(
          (target as { document?: unknown }).document
        );
        const validation = await validate(document, spec.validateMeta(target));

        if (opts.json) {
          asJson({
            [spec.idKey]: documentId,
            restored: spec.toItem(target),
            snapshot: spec.toItem(backup),
            ...spec.restoreJsonExtra(updated),
            validation
          });
        } else {
          console.log(
            spec.restoreSummary(
              documentId,
              number,
              spec.counts(document),
              target
            )
          );
          const meta = backup as { version: number; save_type: string };
          console.log(
            `  pre-restore state saved as v${meta.version} (${meta.save_type})`
          );
          console.log(spec.renderValidation(validation).join("\n"));
        }
        restoredOk = validation.ok;
      } catch (e) {
        printCommandError(e, opts.json);
        process.exit(1);
      }
      process.exit(restoredOk ? 0 : 1);
    });

  versions
    .command(`delete ${id} <version>`)
    .description(spec.descriptions.delete)
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
            spec.confirmDelete(documentId, number),
            opts.yes
          );
          if (!ok) {
            aborted = true;
            if (opts.json) {
              asJson({
                [spec.idKey]: documentId,
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
                [spec.idKey]: documentId,
                version: number,
                deleted: true
              });
            } else {
              console.log(spec.deleted(documentId, number));
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
