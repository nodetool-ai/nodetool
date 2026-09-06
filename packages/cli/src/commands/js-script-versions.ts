/**
 * `nodetool jsscript versions` — the version-history half of the JS-script
 * commands. The commands themselves live in `version-commands.ts`; this file
 * is the script's row shapes, database seam, columns and messages.
 *
 * JS scripts keep immutable snapshots: manual saves, autosaves the server
 * writes on a document update, and the pre-restore snapshot that makes a
 * restore undoable. The history is read and written directly against the local
 * database, so an agent can work without a server.
 */
import type { Command } from "commander";
import type { JsScriptValidation } from "@nodetool-ai/execution/js-script-debug";
import { renderJsScriptValidation } from "./js-script-validation-output.js";
import {
  countArray,
  registerVersionCommands,
  type JsonValue,
  type VersionCommandDeps,
  type VersionCommandSpec,
  type VersionStore
} from "./version-commands.js";

export { parseVersionDocument, parseVersionNumber } from "./version-commands.js";

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

export type JsScriptVersionStore = VersionStore<JsScriptRow, JsScriptVersionRow>;

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
  return items.map(tableRow);
}

function tableRow(v: JsScriptVersionListItem): Record<string, unknown> {
  return {
    version: v.version,
    saveType: v.saveType,
    name: v.name ?? "",
    createdAt: v.createdAt
  };
}

/** Port and test counts of whatever a version stored. */
export function documentCounts(document: JsonValue | undefined) {
  const doc = (document ?? {}) as Record<string, unknown>;
  return {
    inputs: countArray(doc.inputs),
    outputs: countArray(doc.outputs),
    tests: countArray(doc.tests)
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
    load: async (id) => await JsScript.findById(id),
    listVersions: async (jsScriptId, opts) =>
      await JsScriptVersion.listForScript(jsScriptId, opts),
    findVersion: async (jsScriptId, version) =>
      await JsScriptVersion.findByVersion(jsScriptId, version),
    snapshot: async (script, opts) =>
      await JsScriptVersion.snapshot(script, opts),
    restore: async (script, version) =>
      await JsScript.updateFieldsIfUnchanged(script.id, script.updated_at, {
        document: version.document
      }),
    deleteVersion: async (jsScriptId, version) => {
      const row = await JsScriptVersion.findByVersion(jsScriptId, version);
      if (row) await row.delete();
    }
  };
}

const spec: VersionCommandSpec<
  JsScriptRow,
  JsScriptVersionRow,
  JsScriptVersionListItem,
  JsScriptValidation,
  ReturnType<typeof documentCounts>,
  void
> = {
  idArg: "js_script_id",
  idKey: "jsScriptId",
  descriptions: {
    group:
      "Inspect and restore the snapshot history of a JS script (manual saves, autosaves, pre-restore snapshots)",
    list: "List a script's versions, newest first",
    show: "Print one version's metadata and the document it stored",
    create: "Snapshot the script as it stands now (a manual save)",
    restore:
      "Restore a version onto the script. The pre-restore state is snapshotted first, and the restored document is validated against the current schema — a restore whose document no longer validates exits non-zero",
    delete: "Delete one version from a script's history",
    restoreJson: "Print the restore result as JSON"
  },
  notFoundDocument: (id) => `JS script not found: ${id}`,
  notFoundVersion: (id, version) =>
    `JS script version not found: ${id} v${version}`,
  conflict: "Script was modified since last read",
  confirmDelete: (id, version) => `Delete v${version} of JS script ${id}?`,
  deleted: (id, version) => `✅ Deleted v${version} of JS script ${id}`,
  toItem: toVersionListItem,
  tableRow,
  counts: documentCounts,
  showSummary: (counts) =>
    `\n  ${counts.inputs} input(s), ${counts.outputs} output(s), ${counts.tests} test(s)`,
  restoreSummary: (id, version, counts) =>
    `✅ Restored v${version} onto ${id}: ${counts.inputs} input(s), ${counts.outputs} output(s), ${counts.tests} test(s)`,
  restoreJsonExtra: () => ({}),
  validateMeta: () => undefined,
  renderValidation: renderJsScriptValidation
};

export type JsScriptVersionsDeps = VersionCommandDeps<
  JsScriptRow,
  JsScriptVersionRow,
  JsScriptValidation,
  void
>;

export function registerJsScriptVersionsCommands(
  jsscript: Command,
  deps: JsScriptVersionsDeps = {}
): void {
  registerVersionCommands(jsscript, spec, deps, {
    store: defaultStore,
    validate: defaultValidate
  });
}
