/**
 * tRPC router for the files domain — local filesystem browser (JSON ops).
 * Binary download (/api/files/download) stays as REST.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";
import {
  listFilesInput,
  listFilesOutput,
  fileInfoInput,
  fileInfoOutput
} from "@nodetool-ai/protocol/api-schemas/files.js";
import { ApiErrorCode } from "@nodetool-ai/protocol/api-schemas/api-error-code.js";

// ── Sandbox helpers ─────────────────────────────────────────────────────────

function getRootDir(): string {
  return os.homedir();
}

function isWithinRoot(candidate: string, normalizedRoot: string): boolean {
  return (
    candidate === normalizedRoot ||
    candidate.startsWith(normalizedRoot + path.sep)
  );
}

/**
 * Resolve a user-provided path within the sandbox root.
 * Returns the resolved absolute path, or throws FORBIDDEN if the path escapes.
 *
 * The lexical check alone is not enough: a symlink that lives under the root but
 * points outside it passes `startsWith` yet resolves elsewhere at the syscall
 * level. So the real (symlink-resolved) path is also verified to stay within the
 * root. realpath is resolved on the deepest existing ancestor so a not-yet-
 * existing leaf still gets its parent chain checked.
 */
async function resolveSandboxed(
  rootDir: string,
  userPath: string
): Promise<string> {
  const resolved = path.resolve(
    rootDir,
    userPath.startsWith("/") ? "." + userPath : userPath
  );
  const normalizedRoot = path.resolve(rootDir);
  if (!isWithinRoot(resolved, normalizedRoot)) {
    throwApiError(ApiErrorCode.FORBIDDEN, "Path traversal not allowed");
  }

  // Resolve symlinks on the deepest existing ancestor and re-check containment.
  let probe = resolved;
  for (;;) {
    try {
      const real = await fs.realpath(probe);
      if (!isWithinRoot(real, normalizedRoot)) {
        throwApiError(ApiErrorCode.FORBIDDEN, "Path traversal not allowed");
      }
      break;
    } catch (err) {
      if (
        err &&
        typeof err === "object" &&
        "name" in err &&
        (err as { name: string }).name === "TRPCError"
      ) {
        throw err; // FORBIDDEN from the containment check above
      }
      const parent = path.dirname(probe);
      if (parent === probe) break; // reached filesystem root without resolving
      probe = parent;
    }
  }
  return resolved;
}

// ── Router ──────────────────────────────────────────────────────────────────

export const filesRouter = router({
  list: protectedProcedure
    .input(listFilesInput)
    .output(listFilesOutput)
    .query(async ({ input }) => {
      if (process.env["NODETOOL_ENV"] === "production") {
        throwApiError(
          ApiErrorCode.FORBIDDEN,
          "File browser is disabled in production"
        );
      }

      const rootDir = getRootDir();
      const resolved = await resolveSandboxed(rootDir, input.path);

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

  info: protectedProcedure
    .input(fileInfoInput)
    .output(fileInfoOutput)
    .query(async ({ input }) => {
      if (process.env["NODETOOL_ENV"] === "production") {
        throwApiError(
          ApiErrorCode.FORBIDDEN,
          "File browser is disabled in production"
        );
      }

      const rootDir = getRootDir();
      const resolved = await resolveSandboxed(rootDir, input.path);

      try {
        const stat = await fs.stat(resolved);
        return {
          name: path.basename(resolved),
          path: resolved,
          size: stat.size,
          is_dir: stat.isDirectory(),
          modified_at: stat.mtime.toISOString()
        };
      } catch {
        throwApiError(ApiErrorCode.NOT_FOUND, "File not found");
      }
    })
});
