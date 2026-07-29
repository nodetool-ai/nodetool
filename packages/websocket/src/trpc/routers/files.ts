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
    })
});
