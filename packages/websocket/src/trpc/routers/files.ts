/**
 * tRPC router for the files domain — local filesystem browser (JSON ops).
 * Binary download (/api/files/download) stays as REST.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";

import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";
import {
  localPathDenialMessage,
  resolveLocalPath
} from "../../lib/local-file-access.js";
import {
  createFolderInput,
  createFolderOutput,
  listFilesInput,
  listFilesOutput
} from "@nodetool-ai/protocol/api-schemas/files.js";
import { ApiErrorCode } from "@nodetool-ai/protocol/api-schemas/api-error-code.js";

// ── Sandbox helpers ─────────────────────────────────────────────────────────

/**
 * Resolve a caller-supplied path inside the allowed roots, or throw FORBIDDEN.
 * The policy itself lives in lib/local-file-access.ts, shared with the REST
 * preview stream (`GET /api/files/local`) so the two can't diverge.
 */
async function resolveSandboxed(userPath: string): Promise<string> {
  const result = await resolveLocalPath(userPath);
  if (!result.ok) {
    throwApiError(
      ApiErrorCode.FORBIDDEN,
      localPathDenialMessage(result.reason)
    );
  }
  return result.path;
}

/** Both procedures are off where the file browser is off. */
function assertBrowserEnabled(): void {
  if (process.env["NODETOOL_ENV"] === "production") {
    throwApiError(
      ApiErrorCode.FORBIDDEN,
      "File browser is disabled in production"
    );
  }
}

/**
 * Refuse anything but a single folder name: the name is a name, not a path,
 * so a `..` or a separator in it is rejected rather than resolved.
 */
function assertFolderName(name: string): string {
  const trimmed = name.trim();
  if (
    !trimmed ||
    trimmed === "." ||
    trimmed === ".." ||
    /[/\\]/.test(trimmed) ||
    trimmed.includes("\0")
  ) {
    throwApiError(ApiErrorCode.INVALID_INPUT, "Invalid folder name");
  }
  return trimmed;
}

// ── Router ──────────────────────────────────────────────────────────────────

export const filesRouter = router({
  list: protectedProcedure
    .input(listFilesInput)
    .output(listFilesOutput)
    .query(async ({ input }) => {
      assertBrowserEnabled();

      const resolved = await resolveSandboxed(input.path);

      try {
        const entries = await fs.readdir(resolved, { withFileTypes: true });
        return Promise.all(
          entries.map(async (entry) => {
            const fullPath = path.join(resolved, entry.name);
            let size = 0;
            let modifiedAt = "";
            try {
              const stat = await fs.stat(fullPath);
              size = stat.size;
              modifiedAt = stat.mtime.toISOString();
            } catch {
              // stat may fail for broken symlinks — return defaults
            }
            return {
              name: entry.name,
              path: fullPath,
              size,
              is_dir: entry.isDirectory(),
              modified_at: modifiedAt
            };
          })
        );
      } catch {
        throwApiError(ApiErrorCode.NOT_FOUND, "Directory not found");
      }
    }),

  /**
   * Create one folder inside a directory the caller may browse.
   *
   * Here so choosing a workspace folder that does not exist yet does not mean
   * leaving the app for the OS file manager.
   */
  createFolder: protectedProcedure
    .input(createFolderInput)
    .output(createFolderOutput)
    .mutation(async ({ input }) => {
      assertBrowserEnabled();

      const name = assertFolderName(input.name);
      // `resolveSandboxed` is what refuses a parent outside the allowed roots
      // or reached through a symlink that leaves them; the joined path goes
      // through it again so containment is checked on what is actually created.
      const parent = await resolveSandboxed(input.path);
      const target = await resolveSandboxed(path.join(parent, name));

      try {
        await fs.mkdir(target);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "EEXIST") {
          throwApiError(
            ApiErrorCode.ALREADY_EXISTS,
            `"${name}" already exists here`
          );
        }
        if (code === "ENOENT") {
          throwApiError(ApiErrorCode.NOT_FOUND, "Directory not found");
        }
        throwApiError(
          ApiErrorCode.INTERNAL_ERROR,
          `Could not create the folder: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }

      const stat = await fs.stat(target);
      return {
        name,
        path: target,
        size: stat.size,
        is_dir: true,
        modified_at: stat.mtime.toISOString()
      };
    })
});
