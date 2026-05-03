/**
 * tRPC router for the storage domain — JSON ops only.
 * Binary PUT/GET stay as REST (/api/storage/*).
 */
import { stat, unlink, readdir } from "node:fs/promises";
import path from "node:path";
import { extname } from "node:path";
import {
  getDefaultAssetsPath,
  loadAssetStorageConfig
} from "@nodetool-ai/config";
import { createAssetUrlBuilder } from "@nodetool-ai/storage";

import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";
import {
  listStorageInput,
  listStorageOutput,
  storageMetadataInput,
  storageMetadataOutput,
  storageDeleteInput,
  storageDeleteOutput,
  signUrlInput,
  signUrlOutput
} from "@nodetool-ai/protocol/api-schemas/storage.js";
import { ApiErrorCode } from "@nodetool-ai/protocol/api-schemas/api-error-code.js";

// ── MIME types (mirrors storage-api.ts) ──────────────────────────────────────

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".json": "application/json",
  ".txt": "text/plain",
  ".pdf": "application/pdf"
};

function getMimeType(filePath: string): string {
  return (
    MIME_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream"
  );
}

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

function resolveStoragePath(rootDir: string, key: string): string {
  const normalized = key
    .replace(/\\/g, "/")
    .split("/")
    .filter((p) => p && p !== ".")
    .join("/");
  return path.join(rootDir, normalized);
}

function keyFromPath(rootDir: string, filePath: string): string {
  return path
    .relative(rootDir, filePath)
    .replace(/\\/g, "/");
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
  list: protectedProcedure
    .input(listStorageInput)
    .output(listStorageOutput)
    .query(async ({ input }) => {
      const rootDir = getDefaultAssetsPath();
      const prefix = input.prefix ?? "";

      // Validate prefix if provided
      if (prefix) {
        const err = validateStorageKey(prefix);
        if (err) {
          throwApiError(ApiErrorCode.INVALID_INPUT, err);
        }
      }

      const baseDir = prefix
        ? resolveStoragePath(rootDir, prefix)
        : rootDir;

      // Recursively collect all file entries
      const entries: {
        key: string;
        size: number;
        content_type: string;
        last_modified: string;
      }[] = [];

      async function walk(dir: string): Promise<void> {
        let dirents;
        try {
          dirents = await readdir(dir, { withFileTypes: true });
        } catch {
          return; // directory may not exist yet
        }
        for (const dirent of dirents) {
          const fullPath = path.join(dir, dirent.name);
          if (dirent.isDirectory()) {
            await walk(fullPath);
          } else {
            try {
              const fileStat = await stat(fullPath);
              entries.push({
                key: keyFromPath(rootDir, fullPath),
                size: fileStat.size,
                content_type: getMimeType(fullPath),
                last_modified: fileStat.mtime.toISOString()
              });
            } catch {
              // skip files we can't stat
            }
          }
        }
      }

      await walk(baseDir);
      return { entries, count: entries.length };
    }),

  metadata: protectedProcedure
    .input(storageMetadataInput)
    .output(storageMetadataOutput)
    .query(async ({ input }) => {
      const validationError = validateStorageKey(input.key);
      if (validationError) {
        throwApiError(ApiErrorCode.INVALID_INPUT, validationError);
      }

      const rootDir = getDefaultAssetsPath();
      const filePath = resolveStoragePath(rootDir, input.key);

      try {
        const fileStat = await stat(filePath);
        return {
          key: input.key,
          size: fileStat.size,
          content_type: getMimeType(filePath),
          last_modified: fileStat.mtime.toISOString()
        };
      } catch {
        throwApiError(ApiErrorCode.NOT_FOUND, "Object not found");
      }
    }),

  signUrl: protectedProcedure
    .input(signUrlInput)
    .output(signUrlOutput)
    .query(async ({ input }) => {
      const validationError = validateStorageKey(input.key);
      if (validationError) {
        throwApiError(ApiErrorCode.INVALID_INPUT, validationError);
      }
      const url = await getUrlBuilder()(input.key);
      return { url };
    }),

  delete: protectedProcedure
    .input(storageDeleteInput)
    .output(storageDeleteOutput)
    .mutation(async ({ input }) => {
      const validationError = validateStorageKey(input.key);
      if (validationError) {
        throwApiError(ApiErrorCode.INVALID_INPUT, validationError);
      }

      const rootDir = getDefaultAssetsPath();
      const filePath = resolveStoragePath(rootDir, input.key);

      try {
        await stat(filePath);
      } catch {
        throwApiError(ApiErrorCode.NOT_FOUND, "Object not found");
      }

      await unlink(filePath);
      return { ok: true as const };
    })
});
