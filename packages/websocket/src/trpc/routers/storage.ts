/**
 * tRPC router for the storage domain — JSON ops only.
 * Binary PUT/GET stay as REST (/api/storage/*).
 */
import { loadAssetStorageConfig } from "@nodetool-ai/config";
import { createAssetUrlBuilder } from "@nodetool-ai/storage";

import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";
import { assetKeyOwner } from "@nodetool-ai/storage";
import {
  callerOwnsStorageKey,
  canReadStorageKey
} from "../../lib/storage-access.js";
import { resolveExistingAssetKey } from "../../lib/asset-paths.js";
import { getAssetAdapter } from "../../lib/storage.js";
import {
  signUrlInput,
  signUrlOutput,
  storageAllowanceOutput,
  storageFilesOutput,
  type StorageHolder
} from "@nodetool-ai/protocol/api-schemas/storage.js";
import {
  isSharedDocumentType,
  storageAllowanceStatus,
  storageFiles,
  type StorageHolder as ModelStorageHolder
} from "@nodetool-ai/models";
import { loadAccessDocument } from "../../lib/document-access.js";
import { ApiErrorCode } from "@nodetool-ai/protocol/api-schemas/api-error-code.js";

// ── Key validation (mirrors storage-api.ts) ──────────────────────────────────

function validateStorageKey(key: string): string | null {
  if (!key) return "Key is required";
  if (key.startsWith("/")) return "Key must not be absolute path";
  const parts = key
    .replace(/\\/g, "/")
    .split("/")
    .filter((p) => p && p !== ".");
  if (parts.some((p) => p === ".."))
    return "Key must not contain path traversal";
  return null; // valid
}

// ── URL builder (lazy, cached per backend kind) ───────────────────────────────

let _urlBuilder: ((key: string) => Promise<string>) | null = null;
let _urlBuilderKind: string | null = null;

function getUrlBuilder(): (key: string) => Promise<string> {
  const config = loadAssetStorageConfig();
  if (!_urlBuilder || _urlBuilderKind !== config.kind) {
    _urlBuilderKind = config.kind;
    _urlBuilder = createAssetUrlBuilder(config);
  }
  return _urlBuilder;
}

// ── Storage view ─────────────────────────────────────────────────────────────

/** Whether the document exists and the caller owns it. */
async function ownsDocument(userId: string, documentType: string, documentId: string): Promise<boolean> {
  if (documentType !== "workflow" && !isSharedDocumentType(documentType)) return false;
  const document = await loadAccessDocument(documentType, documentId);
  return document?.user_id === userId;
}

function holderResponse(holder: ModelStorageHolder): StorageHolder {
  switch (holder.kind) {
    case "current":
      return { kind: "current", document_type: holder.documentType, document_id: holder.documentId };
    case "version":
      return {
        kind: "version",
        document_type: holder.documentType,
        document_id: holder.documentId,
        version_id: holder.versionId
      };
    case "deleted_document":
      return {
        kind: "deleted_document",
        document_type: holder.documentType,
        document_id: holder.documentId,
        name: holder.name,
        purge_at: holder.purgeAt
      };
    case "deleted_project":
      return { kind: "deleted_project", project_id: holder.projectId, name: holder.name, purge_at: holder.purgeAt };
  }
}

// ── Router ────────────────────────────────────────────────────────────────────

export const storageRouter = router({
  signUrl: protectedProcedure
    .input(signUrlInput)
    .output(signUrlOutput)
    .query(async ({ ctx, input }) => {
      const validationError = validateStorageKey(input.key);
      if (validationError) {
        throwApiError(ApiErrorCode.INVALID_INPUT, validationError);
      }
      if (!(await canReadStorageKey(ctx.userId, input.key))) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Object not found");
      }
      // Prefer the owner-prefixed object; fall back to the flat legacy key
      // when a deployment hasn't run `nodetool storage migrate-keys` yet.
      // Also handle the reverse: a flat asset reference (e.g. from an old
      // `asset://<id>.png` markdown image) is translated to the current
      // owner-prefixed key when that object exists. A prefixed key that
      // passed the read check is the caller's own or, for a collaborator,
      // that of an owner whose shared document shows the asset.
      const adapter = getAssetAdapter();
      const owner = assetKeyOwner(input.key);
      let key = input.key;
      if (owner !== null) {
        const resolved = await resolveExistingAssetKey(
          adapter,
          owner,
          input.key.slice(owner.length + 1)
        );
        // Falling back drops the owner prefix, and the prefix was the only
        // thing that vouched for ownership — `<me>/<someone-else's-id>.png`
        // would otherwise resolve to (and sign) their flat object. Re-check
        // against the `assets` row, exactly as the REST route does.
        if (resolved) {
          const stillOwned =
            assetKeyOwner(resolved) === owner ||
            (await callerOwnsStorageKey(owner, resolved));
          if (!stillOwned) {
            throwApiError(ApiErrorCode.NOT_FOUND, "Object not found");
          }
          key = resolved;
        }
      } else {
        // Flat key (legacy or from `asset://<id>.ext`): prefer the
        // owner-prefixed object when it exists, otherwise keep the flat key.
        // This lets `asset://<asset-id>.png` references resolve to
        // `<user>/<asset-id>.png` on deployments that have migrated.
        const resolved = await resolveExistingAssetKey(
          adapter,
          ctx.userId,
          input.key
        );
        if (resolved) {
          const stillOwned =
            assetKeyOwner(resolved) === ctx.userId ||
            (await callerOwnsStorageKey(ctx.userId, resolved));
          if (!stillOwned) {
            throwApiError(ApiErrorCode.NOT_FOUND, "Object not found");
          }
          key = resolved;
        }
      }
      const url = await getUrlBuilder()(key);
      return { url };
    }),

  /** The caller's storage use against the allowance (WP2.3). */
  allowance: protectedProcedure.output(storageAllowanceOutput).query(async ({ ctx }) => {
    const status = await storageAllowanceStatus(ctx.userId);
    return {
      used_bytes: status.usedBytes,
      file_count: status.fileCount,
      allowance_bytes: status.allowanceBytes,
      over_allowance: status.overAllowance,
      near_allowance: status.nearAllowance
    };
  }),

  /**
   * The storage view: every file the caller's use counts and what keeps it.
   * A document of another person that refers to the caller's file is not
   * named.
   */
  files: protectedProcedure.output(storageFilesOutput).query(async ({ ctx }) => {
    const files = await storageFiles(ctx.userId, (type, id) => ownsDocument(ctx.userId, type, id));
    return {
      files: files.map((file) => ({
        hash: file.hash,
        size: file.size,
        projects: file.projects,
        asset_ids: file.assetIds,
        holders: file.holders.map(holderResponse)
      }))
    };
  })
});
