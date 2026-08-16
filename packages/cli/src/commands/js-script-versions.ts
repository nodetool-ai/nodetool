/**
 * `nodetool jsscript versions` — the version-history half of the JS-script
 * commands.
 *
 * JS scripts keep immutable snapshots: manual saves, autosaves the server
 * writes on a document update, and the pre-restore snapshot that makes a
 * restore undoable. These commands read and write that history directly
 * against the local database, so an agent can inspect, snapshot and restore
 * without a server.
 *
 * `restore` mirrors the tRPC router (`jsScripts.documentVersions.restore`):
 * snapshot what is about to be overwritten, then CAS-write the version's
 * document back onto the script, then run the same static check
 * `jsscript validate` runs. An old document is restored against today's
 * schema, so what it used to pass is not what it passes now — a restore whose
 * document no longer validates exits non-zero and prints the issues.
 *
 * The database and the validator core are injected with lazy defaults, so
 * registration stays light and the actions are unit-testable.
 */
import type { Command } from "commander";
import type { JsScriptValidation } from "@nodetool-ai/execution/js-script-debug";
import { printCommandError } from "../command-errors.js";
import { asJson, confirm, printTable } from "./output.js";
import { numericOptionParser } from "../numeric-options.js";
import { renderJsScriptValidation } from "./js-script-validation-output.js";

/** A decoded JSON document, before anything validates its shape. */
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** A `js_scripts` row as these commands need it. */
export interface JsScriptRow {
  id: string;
  user_id: string;
  name?: string | null;
  updated_at: string;
  document: string;
}

/** A `js_script_versions` row. */
export interface JsScriptVersionRow {
  id: string;
  js_script_id: string;
  version: number;
  name: string | null;
  save_type: string;
  created_at: string;
  document: string;
}

/** The model calls these commands make — the whole database seam. */
export interface JsScriptVersionStore {
  loadScript: (id: string) => Promise<JsScriptRow | null>;
  listVersions: (
    jsScriptId: string,
    opts: { limit?: number; saveType?: string }
  ) => Promise<JsScriptVersionRow[]>;
  findVersion: (
    jsScriptId: string,
    version: number
  ) => Promise<JsScriptVersionRow | null>;
  snapshot: (
    script: JsScriptRow,
    opts: { saveType: "manual" | "restore"; name?: string | null }
  ) => Promise<JsScriptVersionRow>;
  /**
   * Write a version's document back onto the script, compare-and-swap on the
   * `updated_at` it was loaded with. Resolves to null when someone else wrote
   * first.
   */
  restore: (
    script: JsScriptRow,
    version: JsScriptVersionRow
  ) => Promise<JsScriptRow | null>;
  deleteVersion: (jsScriptId: string, version: number) => Promise<void>;
}

export interface JsScriptVersionsDeps {
  /** Defaults to the local database through `@nodetool-ai/models`. */
  store?: () => Promise<JsScriptVersionStore>;
  /** Defaults to `validateJsScriptDoc` from the js-script-debug core. */
  validate?: (document: unknown) => Promise<JsScriptValidation>;
  /** Defaults to the interactive prompt in `output.ts`. */
  confirmDelete?: (message: string, force?: boolean) => Promise<boolean>;
}

/** The list-item shape, matching the tRPC router's `jsScriptVersionListItem`. */
export interface JsScriptVersionListItem {
  id: string;
  version: number;
  name: string | null;
  saveType: string;
  createdAt: string;
}

export function toVersionListItem(
  row: JsScriptVersionRow
): JsScriptVersionListItem {
  return {
    id: row.id,
    version: row.version,
    name: row.name ?? null,
    saveType: row.save_type,
    createdAt: row.created_at
  };
}

/** One table row per version: what it is and when it was taken. */
export function versionTableRows(
  items: JsScriptVersionListItem[]
): Record<string, unknown>[] {
  return items.map((v) => ({
    version: v.version,
    saveType: v.saveType,
    name: v.name ?? "",
    createdAt: v.createdAt
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

/** Port and test counts of whatever a version stored. */
export function documentCounts(document: JsonValue | undefined) {
  const doc = (document ?? {}) as Record<string, unknown>;
  const count = (value: unknown): number =>
    Array.isArray(value) ? value.length : 0;
  return {
    inputs: count(doc.inputs),
    outputs: count(doc.outputs),
    tests: count(doc.tests)
  };
}

async function defaultValidate(document: unknown): Promise<JsScriptValidation> {
  const { validateJsScriptDoc } =
    await import("@nodetool-ai/execution/js-script-debug");
  return validateJsScriptDoc(document);
}

async function defaultStore(): Promise<JsScriptVersionStore> {
  const { initDb, JsScript, JsScriptVersion } =
    await import("@nodetool-ai/models");
  const { getDefaultDbPath } = await import("@nodetool-ai/config");
  initDb(getDefaultDbPath());

  return {
    loadScript: async (id) =>
      await JsScript.findById(id),
    listVersions: async (jsScriptId, opts) =>
      (await JsScriptVersion.listForScript(
        jsScriptId,
        opts
      )),
    findVersion: async (jsScriptId, version) =>
      (await JsScriptVersion.findByVersion(
        jsScriptId,
        version
      )),
    snapshot: async (script, opts) =>
      await JsScriptVersion.snapshot(script, opts),
    restore: async (script, version) =>
      (await JsScript.updateFieldsIfUnchanged(script.id, script.updated_at, {
        document: version.document
      })),
    deleteVersion: async (jsScriptId, version) => {
      const row = await JsScriptVersion.findByVersion(jsScriptId, version);
      if (row) await row.delete();
    }
  };
}

/** Load a script or say which id was not found. */
async function requireScript(
  store: JsScriptVersionStore,
  id: string
): Promise<JsScriptRow> {
  const script = await store.loadScript(id);
  if (!script) throw new Error(`JS script not found: ${id}`);
  return script;
}

async function requireVersion(
  store: JsScriptVersionStore,
  jsScriptId: string,
  version: number
): Promise<JsScriptVersionRow> {
  const row = await store.findVersion(jsScriptId, version);
  if (!row) {
    throw new Error(`JS script version not found: ${jsScriptId} v${version}`);
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

export function registerJsScriptVersionsCommands(
  jsscript: Command,
  deps: JsScriptVersionsDeps = {}
): void {
  const openStore = deps.store ?? defaultStore;
  const validate = deps.validate ?? defaultValidate;
  const confirmDelete =
    deps.confirmDelete ??
    ((message: string, force?: boolean) => confirm(message, { force }));

  const versions = jsscript
    .command("versions")
    .description(
      "Inspect and restore the snapshot history of a JS script (manual saves, autosaves, pre-restore snapshots)"
    );

  versions
    .command("list <js_script_id>")
    .description("List a script's versions, newest first")
    .option("--save-type <type>", "Only manual, autosave or restore snapshots")
    .option(
      "--limit <n>",
      "Maximum versions to list (default 100)",
      numericOptionParser("--limit", { integer: true, min: 1 })
    )
    .option("--json", "Print the versions as JSON")
    .action(async (scriptId: string, opts: ListOptions) => {
      try {
        const store = await openStore();
        await requireScript(store, scriptId);
        const query: Parameters<typeof store.listVersions>[1] = {};
        if (opts.limit !== undefined) {
          query.limit = opts.limit;
        }
        if (opts.saveType) {
          query.saveType = opts.saveType;
        }
        const rows = await store.listVersions(scriptId, query);
        const items = rows.map(toVersionListItem);

        if (opts.json) {
          asJson({ jsScriptId: scriptId, versions: items });
          return;
        }
        printTable(versionTableRows(items));
      } catch (e) {
        printCommandError(e, opts.json);
        process.exit(1);
      }
    });

  versions
    .command("show <js_script_id> <version>")
    .description("Print one version's metadata and the document it stored")
    .option("--json", "Print the metadata and the full document as JSON")
    .action(async (scriptId: string, version: string, opts: JsonOption) => {
      try {
        const number = parseVersionNumber(version);
        const store = await openStore();
        await requireScript(store, scriptId);
        const row = await requireVersion(store, scriptId, number);
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
            createdAt: item.createdAt
          }
        ]);
        console.log(
          `\n  ${counts.inputs} input(s), ${counts.outputs} output(s), ${counts.tests} test(s)`
        );
      } catch (e) {
        printCommandError(e, opts.json);
        process.exit(1);
      }
    });

  versions
    .command("create <js_script_id>")
    .description("Snapshot the script as it stands now (a manual save)")
    .option("--name <name>", "Label for the snapshot")
    .option("--json", "Print the created version as JSON")
    .action(async (scriptId: string, opts: JsonOption & { name?: string }) => {
      try {
        const store = await openStore();
        const script = await requireScript(store, scriptId);
        const row = await store.snapshot(script, {
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
    });

  versions
    .command("restore <js_script_id> <version>")
    .description(
      "Restore a version onto the script. The pre-restore state is snapshotted first, and the restored document is validated against the current schema — a restore whose document no longer validates exits non-zero"
    )
    .option("--json", "Print the restore result as JSON")
    .action(async (scriptId: string, version: string, opts: JsonOption) => {
      // The verdict leaves the try block in a variable: `process.exit` throws
      // under test, and an exit inside the try would be caught here as a
      // command failure.
      let restoredOk = false;
      try {
        const number = parseVersionNumber(version);
        const store = await openStore();
        const script = await requireScript(store, scriptId);
        const target = await requireVersion(store, scriptId, number);

        // Snapshot what is about to be overwritten first, so the restore is
        // itself undoable — same order the tRPC router uses.
        const backup = await store.snapshot(script, {
          saveType: "restore",
          name: `Before restore to v${number}`
        });

        const updated = await store.restore(script, target);
        if (!updated) {
          throw new Error("Script was modified since last read");
        }

        const document = parseVersionDocument(target.document);
        const validation = await validate(document);

        if (opts.json) {
          asJson({
            jsScriptId: scriptId,
            restored: toVersionListItem(target),
            snapshot: toVersionListItem(backup),
            validation
          });
        } else {
          const counts = documentCounts(document);
          console.log(
            `✅ Restored v${number} onto ${scriptId}: ${counts.inputs} input(s), ${counts.outputs} output(s), ${counts.tests} test(s)`
          );
          console.log(
            `  pre-restore state saved as v${backup.version} (${backup.save_type})`
          );
          console.log(renderJsScriptValidation(validation).join("\n"));
        }
        restoredOk = validation.ok;
      } catch (e) {
        printCommandError(e, opts.json);
        process.exit(1);
      }
      process.exit(restoredOk ? 0 : 1);
    });

  versions
    .command("delete <js_script_id> <version>")
    .description("Delete one version from a script's history")
    .option("-y, --yes", "Skip the confirmation prompt")
    .option("--json", "Print the result as JSON")
    .action(
      async (
        scriptId: string,
        version: string,
        opts: JsonOption & { yes?: boolean }
      ) => {
        let aborted = false;
        try {
          const number = parseVersionNumber(version);
          const store = await openStore();
          await requireScript(store, scriptId);
          await requireVersion(store, scriptId, number);

          const ok = await confirmDelete(
            `Delete v${number} of JS script ${scriptId}?`,
            opts.yes
          );
          if (!ok) {
            aborted = true;
            if (opts.json) {
              asJson({
                jsScriptId: scriptId,
                version: number,
                deleted: false,
                aborted: true
              });
            } else {
              console.error("Aborted.");
            }
          } else {
            await store.deleteVersion(scriptId, number);
            if (opts.json) {
              asJson({ jsScriptId: scriptId, version: number, deleted: true });
            } else {
              console.log(`✅ Deleted v${number} of JS script ${scriptId}`);
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
