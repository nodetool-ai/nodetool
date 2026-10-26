/**
 * The rename half of the document edit tools.
 *
 * `update_workflow` and `edit_app` always took a `name`, but the op-script
 * editors (`edit_timeline`, `edit_sketch`, `edit_storyboard`, `edit_script`,
 * `edit_js_script`) only reached the document body, so an agent asked to
 * rename a timeline had to resend the whole document and a sketch, storyboard
 * or script could not be renamed at all — while the sandbox coverage table
 * claimed each router's `update` for the matching edit tool. Every one of
 * those rows has a `name` column and an `updateFieldsIfUnchanged` that writes
 * it, so one helper serves all of them.
 */

type ToolError = { error: string };

/** Longest name the routers accept for any of these documents. */
export const MAX_DOCUMENT_NAME_LENGTH = 200;

/** The `name` property each edit tool's schema gains. */
export function renameProperty(noun: string): {
  type: "string";
  description: string;
} {
  return {
    type: "string",
    description:
      `Rename the ${noun}. Pass it on its own, without ops, to only rename; ` +
      "with ops, the rename is written after them."
  };
}

/**
 * Read the `name` argument: absent is `undefined`, a usable name comes back
 * trimmed, and anything else is an error rather than a silently skipped
 * rename.
 */
export function parseRename(raw: unknown): string | undefined | ToolError {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string" || raw.trim() === "") {
    return { error: "name must be a non-empty string." };
  }
  const name = raw.trim();
  if (name.length > MAX_DOCUMENT_NAME_LENGTH) {
    return {
      error: `name is ${name.length} characters; at most ${MAX_DOCUMENT_NAME_LENGTH}.`
    };
  }
  return name;
}

interface RenamableRow {
  id: string;
  user_id: string;
  name: string;
  updated_at: string;
  revision?: number;
}

/** The slice of a document model the rename needs. */
export interface RenamableModel<Row extends RenamableRow> {
  findById(id: string): Promise<Row | null>;
  updateFieldsIfUnchanged(
    id: string,
    expectedUpdatedAt: string,
    fields: { name: string }
  ): Promise<Row | null>;
}

const RENAME_ATTEMPTS = 3;

/**
 * Rename a row the caller owns. A name touches nothing an op or an open
 * editor writes, so a compare-and-swap that loses to a concurrent write is
 * retried against the fresh row instead of being reported as a conflict.
 * When `expectedUpdatedAt` is given the caller asked for that exact version,
 * and a mismatch is refused instead.
 */
export async function renameOwned<Row extends RenamableRow>(
  model: RenamableModel<Row>,
  options: {
    id: string;
    userId: string | null | undefined;
    name: string;
    label: string;
    expectedUpdatedAt?: string;
  }
): Promise<Row | ToolError> {
  const { id, userId, name, label, expectedUpdatedAt } = options;
  for (let attempt = 0; attempt < RENAME_ATTEMPTS; attempt++) {
    const row = await model.findById(id);
    // Someone else's row reads as missing, the rule the routers apply.
    if (!row || row.user_id !== userId) {
      return { error: `${label} ${id} was not found.` };
    }
    if (expectedUpdatedAt !== undefined && row.updated_at !== expectedUpdatedAt) {
      return {
        error:
          `${label} ${row.id} changed since it was read; it was not renamed. ` +
          "Read it again and retry."
      };
    }
    if (row.name === name) return row;
    const saved = await model.updateFieldsIfUnchanged(row.id, row.updated_at, {
      name
    });
    if (saved) return saved;
    if (expectedUpdatedAt !== undefined) {
      return {
        error:
          `${label} ${row.id} changed while it was being renamed; it was not ` +
          "renamed. Read it again and retry."
      };
    }
  }
  return {
    error: `${label} ${id} is being modified concurrently; it was not renamed. Retry the call.`
  };
}

/**
 * Run an edit tool's ops and/or its rename. With no ops the call is a rename
 * alone; with both, the rename follows the ops and is skipped when they were
 * refused outright, so a failed edit does not half-land as a new name.
 */
export async function editWithRename<Row extends RenamableRow>(options: {
  ops: unknown;
  name: string | undefined;
  idKey: string;
  applyOps: () => Promise<Record<string, unknown>>;
  rename: (name: string) => Promise<Row | ToolError>;
}): Promise<Record<string, unknown>> {
  const { ops, name, idKey, applyOps, rename } = options;
  // Without ops or a name the ops parser's own error says what is missing.
  if ((ops === undefined || ops === null) && name !== undefined) {
    const renamed = await rename(name);
    if ("error" in renamed) return renamed;
    return { [idKey]: renamed.id, ...renamedFields(renamed) };
  }
  const result = await applyOps();
  if (name === undefined || typeof result["error"] === "string") return result;
  const renamed = await rename(name);
  if ("error" in renamed) {
    return { ...result, rename_error: renamed.error };
  }
  return { ...result, ...renamedFields(renamed) };
}

/** What a rename changes on the row, for the tool result. */
function renamedFields(row: RenamableRow): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    name: row.name,
    updated_at: row.updated_at
  };
  // A row that counts revisions bumped it, and a later edit checks it.
  if (typeof row.revision === "number") fields["revision"] = row.revision;
  return fields;
}
