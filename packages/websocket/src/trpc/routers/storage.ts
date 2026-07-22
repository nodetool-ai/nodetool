/**
 * tRPC router for the storage domain — JSON ops only.
 * Binary PUT/GET stay as REST (/api/storage/*).
 */
import path from "node:path";
import { loadAssetStorageConfig } from "@nodetool-ai/config";
import { createAssetUrlBuilder } from "@nodetool-ai/storage";
import { Asset } from "@nodetool-ai/models";

import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";
import {
  signUrlInput,
  signUrlOutput
} from "@nodetool-ai/protocol/api-schemas/storage.js";
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

// Asset files are stored flat as `{assetId}.{ext}` and `{assetId}_thumb.jpg`.
// Derive the owning asset id from a storage key so operations can be scoped to
// the caller — the storage dir is a single shared bucket with no per-user
// prefix, so without this any authenticated user could enumerate/read/delete
// every other user's asset files (IDOR).
function assetIdFromKey(key: string): string | null {
  const base = path.basename(key.replace(/\\/g, "/"));
  const withoutExt = base.replace(/\.[^.]+$/, "");
  const id = withoutExt.replace(/_thumb$/, "");
  return id || null;
}

// Verifies the key references an asset owned by `userId`. Returns false (fail
// closed) for keys that don't map to an owned asset, so a traversal-clean but
// foreign key can't be read or deleted.
async function callerOwnsKey(userId: string, key: string): Promise<boolean> {
  const assetId = assetIdFromKey(key);
  if (!assetId) return false;
  try {
    return (await Asset.find(userId, assetId)) !== null;
  } catch {
    // Fail closed: deny when ownership can't be verified.
    return false;
  }
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
      if (!(await callerOwnsKey(ctx.userId, input.key))) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Object not found");
      }
      const url = await getUrlBuilder()(input.key);
      return { url };
    })
});
