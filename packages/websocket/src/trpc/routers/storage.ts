/**
 * tRPC router for the storage domain — JSON ops only.
 * Binary PUT/GET stay as REST (/api/storage/*).
 */
import { loadAssetStorageConfig } from "@nodetool-ai/config";
import { createAssetUrlBuilder } from "@nodetool-ai/storage";

import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";
import { callerOwnsStorageKey } from "../../lib/storage-access.js";
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
      if (!(await callerOwnsStorageKey(ctx.userId, input.key))) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Object not found");
      }
      const url = await getUrlBuilder()(input.key);
      return { url };
    })
});
