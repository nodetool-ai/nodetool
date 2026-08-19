/**
 * JS scripts router — tRPC.
 *
 * A JS script is a named, versioned script document: declared ports, sandbox
 * packages, secrets, a timeout, and saved test cases. Distinct from `scripts`,
 * which holds video/voiceover scripts.
 *
 * Procedures:
 *   list             (query)    — JsScriptListItem[]
 *   palette          (query)    — the caller's custom nodes, each with the
 *                                  version pinned for it (writes a snapshot
 *                                  when the newest one no longer matches)
 *   get              (query)    — JsScriptResponse
 *   create           (mutation) — JsScriptResponse
 *   update           (mutation) — JsScriptResponse (CAS via baseUpdatedAt)
 *   delete           (mutation) — { ok: true }
 *   documentVersions:            — whole-document snapshot history
 *     list           (query)    — JsScriptVersionListItem[]
 *     get            (query)    — JsScriptVersionResponse
 *     create         (mutation) — JsScriptVersionListItem (manual snapshot)
 *     restore        (mutation) — { script, issues } (snapshots the pre-restore
 *                                  state first, so a restore is undoable, then
 *                                  re-validates against today's schema)
 *     delete         (mutation) — { ok: true }
 */

import { z } from "zod";
import { JsScript, JsScriptVersion } from "@nodetool-ai/models";
import type { JsScriptSaveType } from "@nodetool-ai/models";
import {
  createJsScriptInput,
  createJsScriptVersionInput,
  deleteJsScriptVersionInput,
  emptyJsScriptDocument,
  getJsScriptVersionInput,
  jsScriptListItem,
  jsScriptResponse,
  jsScriptVersionListItem,
  jsScriptVersionResponse,
  listJsScriptVersionsInput,
  patchJsScriptInput,
  restoreJsScriptVersionInput,
  restoreJsScriptVersionResponse,
  validateJsScriptDocument
} from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import { ApiErrorCode } from "../../error-codes.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";
import { isString } from "../../lib/wire-values.js";

/** A decoded JSON value: what a stored document or graph carries. */
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

const listInput = z.object({
  projectId: z.string().optional()
});

const idInput = z.object({ id: z.string() });

const updateInput = patchJsScriptInput.and(
  z.object({
    id: z.string(),
    baseUpdatedAt: z.string().optional()
  })
);

const okOutput = z.object({ ok: z.literal(true) });

/** One custom node: the script's response shape plus the version pinned for it. */
const jsScriptPaletteItem = jsScriptResponse.extend({
  version: z.number().int()
});

function toListItem(script: JsScript) {
  const doc = script.toDocument();
  return {
    id: script.id,
    projectId: script.project_id,
    name: script.name,
    description: doc.description,
    inputs: doc.inputs,
    outputs: doc.outputs,
    updatedAt: script.updated_at
  };
}

function toVersionListItem(version: JsScriptVersion) {
  return {
    id: version.id,
    version: version.version,
    name: version.name ?? null,
    saveType: version.save_type as JsScriptSaveType,
    createdAt: version.created_at
  };
}

/**
 * A version row carries its document as JSON text on SQLite and as an object on
 * Postgres, so parse only when it is a string.
 */
function parseVersionDocument(raw: unknown): JsonValue {
  // SAFETY: a Postgres json column arrives already decoded, and the row's
  // document is JSON either way.
  if (!isString(raw)) return raw as JsonValue;
  try {
    return JSON.parse(raw) as JsonValue;
  } catch {
    throwApiError(
      ApiErrorCode.INTERNAL_ERROR,
      "Stored version document is not valid JSON"
    );
  }
}

/** A stored document, comparable across the SQLite (text) and Postgres (json) columns. */
function documentText(raw: unknown): string {
  return isString(raw) ? raw : JSON.stringify(raw);
}

/**
 * The version number that pins a script's current content: the newest snapshot
 * when it already matches, else a fresh one. Mirrors what the Code node's link
 * hook does before it materializes a script onto a node.
 */
async function pinCurrentVersion(script: JsScript): Promise<number> {
  const [newest] = await JsScriptVersion.listForScript(script.id, { limit: 1 });
  if (newest && documentText(newest.document) === documentText(script.document)) {
    return newest.version;
  }
  const created = await JsScriptVersion.snapshot(script, {
    saveType: "autosave",
    name: "Pinned for the node menu"
  });
  return created.version;
}

async function loadOwned(
  ctxUserId: string | null,
  id: string
): Promise<JsScript> {
  if (!ctxUserId) throwApiError(ApiErrorCode.UNAUTHORIZED, "Unauthorized");
  const script = await JsScript.findById(id);
  if (!script || script.user_id !== ctxUserId) {
    throwApiError(ApiErrorCode.NOT_FOUND, "JS script not found");
  }
  return script;
}

export const jsScriptsRouter = router({
  list: protectedProcedure
    .input(listInput)
    .output(z.array(jsScriptListItem))
    .query(async ({ ctx, input }) => {
      const items = input.projectId
        ? await JsScript.listByProject(input.projectId, ctx.userId)
        : await JsScript.listByUser(ctx.userId);
      return items.map(toListItem);
    }),

  /**
   * The caller's custom nodes: every script whose document carries `palette`,
   * each with the whole document and the version that pins it. The node menu
   * needs the ports to build metadata, the body to materialize a dropped node
   * without a second round trip, and the version number to record on the
   * placed node as provenance.
   *
   * Pinning is why this query writes: a placed node keeps the version it was
   * dropped at, so the menu can only hand out a version whose document is what
   * the user is looking at. It snapshots at most once per content change of an
   * exposed script — a script whose newest snapshot already matches gets that
   * number back.
   */
  palette: protectedProcedure
    .output(z.array(jsScriptPaletteItem))
    .query(async ({ ctx }) => {
      const items = await JsScript.listByUser(ctx.userId);
      const exposed = items.filter(
        (script) => script.toDocument().palette !== undefined
      );
      return Promise.all(
        exposed.map(async (script) => ({
          ...jsScriptResponse.parse(script.toResponse()),
          version: await pinCurrentVersion(script)
        }))
      );
    }),

  get: protectedProcedure
    .input(idInput)
    .output(jsScriptResponse)
    .query(async ({ ctx, input }) => {
      const script = await loadOwned(ctx.userId, input.id);
      return jsScriptResponse.parse(script.toResponse());
    }),

  create: protectedProcedure
    .input(createJsScriptInput)
    .output(jsScriptResponse)
    .mutation(async ({ ctx, input }) => {
      // A client-minted id makes create idempotent: a retry returns the
      // existing row instead of duplicating the document.
      if (input.id) {
        const existing = await JsScript.findById(input.id);
        if (existing) {
          if (existing.user_id !== ctx.userId) {
            throwApiError(ApiErrorCode.NOT_FOUND, "JS script not found");
          }
          return jsScriptResponse.parse(existing.toResponse());
        }
      }
      const fields: ConstructorParameters<typeof JsScript>[0] = {
        user_id: ctx.userId,
        project_id: input.projectId,
        name: input.name,
        document: JSON.stringify(input.document ?? emptyJsScriptDocument())
      };
      // Set only when the client supplied one — the model defaults an id it
      // does not already own as a property.
      if (input.id) {
        fields.id = input.id;
      }
      const script = new JsScript(fields);
      await script.save();
      return jsScriptResponse.parse(script.toResponse());
    }),

  update: protectedProcedure
    .input(updateInput)
    .output(jsScriptResponse)
    .mutation(async ({ ctx, input }) => {
      const script = await loadOwned(ctx.userId, input.id);

      // CAS on this value so the conflict check and the write are atomic. When
      // the client supplies baseUpdatedAt, honor it; otherwise fall back to the
      // just-loaded updated_at so a concurrent write still can't be clobbered.
      const expectedUpdatedAt = input.baseUpdatedAt ?? script.updated_at;
      if (input.baseUpdatedAt && script.updated_at !== input.baseUpdatedAt) {
        throwApiError(
          ApiErrorCode.ALREADY_EXISTS,
          "JS script was modified since last read (optimistic concurrency conflict)"
        );
      }

      const fields: Parameters<typeof JsScript.updateFieldsIfUnchanged>[2] = {};
      if (input.name !== undefined) fields.name = input.name;
      if (input.document !== undefined)
        fields.document = JSON.stringify(input.document);

      const updated = await JsScript.updateFieldsIfUnchanged(
        input.id,
        expectedUpdatedAt,
        fields
      );
      if (!updated) {
        throwApiError(
          ApiErrorCode.ALREADY_EXISTS,
          "JS script was modified since last read (optimistic concurrency conflict)"
        );
      }
      return jsScriptResponse.parse(updated.toResponse());
    }),

  delete: protectedProcedure
    .input(idInput)
    .output(okOutput)
    .mutation(async ({ ctx, input }) => {
      // Ownership, the row, and its version rows are one operation on the
      // model, shared with the sandbox's `delete_js_script` capability.
      await loadOwned(ctx.userId, input.id);
      await JsScript.deleteOwned(ctx.userId, input.id);
      return { ok: true as const };
    }),

  documentVersions: router({
    list: protectedProcedure
      .input(listJsScriptVersionsInput)
      .output(z.array(jsScriptVersionListItem))
      .query(async ({ ctx, input }) => {
        await loadOwned(ctx.userId, input.id);
        const versions = await JsScriptVersion.listForScript(input.id, {
          limit: input.limit,
          saveType: input.saveType
        });
        return versions.map(toVersionListItem);
      }),

    get: protectedProcedure
      .input(getJsScriptVersionInput)
      .output(jsScriptVersionResponse)
      .query(async ({ ctx, input }) => {
        await loadOwned(ctx.userId, input.id);
        const version = await JsScriptVersion.findByVersion(
          input.id,
          input.version
        );
        if (!version) {
          throwApiError(ApiErrorCode.NOT_FOUND, "JS script version not found");
        }
        return {
          ...toVersionListItem(version),
          document: parseVersionDocument(version.document)
        };
      }),

    create: protectedProcedure
      .input(createJsScriptVersionInput)
      .output(jsScriptVersionListItem)
      .mutation(async ({ ctx, input }) => {
        const script = await loadOwned(ctx.userId, input.id);
        const version = await JsScriptVersion.snapshot(script, {
          saveType: "manual",
          name: input.name ?? null
        });
        return toVersionListItem(version);
      }),

    restore: protectedProcedure
      .input(restoreJsScriptVersionInput)
      .output(restoreJsScriptVersionResponse)
      .mutation(async ({ ctx, input }) => {
        const script = await loadOwned(ctx.userId, input.id);
        const version = await JsScriptVersion.findByVersion(
          input.id,
          input.version
        );
        if (!version) {
          throwApiError(ApiErrorCode.NOT_FOUND, "JS script version not found");
        }

        // Snapshot what is about to be overwritten first, so a restore is
        // itself undoable.
        await JsScriptVersion.snapshot(script, {
          saveType: "restore",
          name: `Before restore to v${input.version}`
        });

        const document = parseVersionDocument(version.document);
        // An old document is restored against today's schema, so what it used
        // to pass is not what it passes now. Errors refuse the restore (the
        // model layer would refuse the write anyway, with a worse message);
        // warnings ride back with the restored script.
        const issues = validateJsScriptDocument(document);
        if (issues.some((issue) => issue.severity === "error")) {
          throwApiError(
            ApiErrorCode.INVALID_INPUT,
            `Restored document does not validate: ${issues
              .filter((issue) => issue.severity === "error")
              .map((issue) => issue.message)
              .join("; ")}`
          );
        }

        const updated = await JsScript.updateFieldsIfUnchanged(
          input.id,
          script.updated_at,
          { document: JSON.stringify(document) }
        );
        if (!updated) {
          throwApiError(
            ApiErrorCode.ALREADY_EXISTS,
            "JS script was modified since last read (optimistic concurrency conflict)"
          );
        }
        return {
          script: jsScriptResponse.parse(updated.toResponse()),
          issues
        };
      }),

    delete: protectedProcedure
      .input(deleteJsScriptVersionInput)
      .output(okOutput)
      .mutation(async ({ ctx, input }) => {
        await loadOwned(ctx.userId, input.id);
        const version = await JsScriptVersion.findByVersion(
          input.id,
          input.version
        );
        if (!version) {
          throwApiError(ApiErrorCode.NOT_FOUND, "JS script version not found");
        }
        await version.delete();
        return { ok: true as const };
      })
  })
});
