/**
 * Workspace router — migrated from REST `/api/workspaces*`.
 *
 * NOTE: the binary-read endpoint `GET /api/workspaces/:id/download/:path` stays
 * on REST because tRPC's JSON link doesn't carry binary payloads. `list`, the
 * listing and the text read and write procedures (which return JSON) live here.
 *
 * A workspace is a project's folder. Projects create and adopt their folders
 * (`projects.create`), so this router has no procedure that creates, repoints
 * or deletes a workspace row. Reading is gated by `NODETOOL_ENV=production`:
 * in production only the server-managed folder under the data dir is readable,
 * which reaches nothing the deployment did not create itself.
 */

import { basename } from "node:path";
import { Workspace } from "@nodetool-ai/models";
import type { WorkspaceEntry } from "@nodetool-ai/runtime";
import { workspaceFromRow } from "../../lib/workflow-workspace.js";
import { ApiErrorCode } from "../../error-codes.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";
import {
  listInput,
  listOutput,
  listFilesInput,
  listFilesOutput,
  readFileInput,
  readFileOutput,
  writeFileInput,
  writeFileOutput,
  MAX_TEXT_FILE_BYTES,
  type WorkspaceResponse,
  type FileEntry
} from "@nodetool-ai/protocol/api-schemas/workspace.js";
import type { Workspace as RunWorkspace } from "@nodetool-ai/runtime";

function toWorkspaceResponse(ws: Workspace): WorkspaceResponse {
  return {
    id: ws.id,
    user_id: ws.user_id,
    project_id: ws.project_id,
    name: ws.name,
    path: ws.path,
    is_default: ws.is_default,
    is_managed: ws.isManaged(),
    is_accessible: ws.isAccessible(),
    created_at: ws.created_at,
    updated_at: ws.updated_at
  };
}

/** True when this deployment lets a user point a workspace at a host folder. */
function canManageWorkspaces(): boolean {
  return process.env["NODETOOL_ENV"] !== "production";
}

/**
 * Guard for the read paths: in production only the managed workspace may be
 * read. A row created while the deployment ran locally can point anywhere on
 * the host, and listFiles would happily enumerate it.
 */
function requireReadable(ws: Workspace): void {
  if (!canManageWorkspaces() && !ws.isManaged()) {
    throwApiError(
      ApiErrorCode.FORBIDDEN,
      "This workspace is not readable in production"
    );
  }
}

/**
 * Ceiling on what `readFile` will pull into memory to slice a text preview
 * from. The workspace interface has no ranged read, so a file past this is
 * refused rather than loaded and cut.
 */
const MAX_READABLE_BYTES = 32 * 1024 * 1024;

/**
 * Resolve the row a file procedure addresses, applying the same guards
 * `listFiles` applies: the row must exist, be readable in this deployment, and
 * the path must be workspace-relative.
 */
async function resolveFileTarget(
  userId: string,
  id: string,
  path: string
): Promise<{ row: Workspace; workspace: RunWorkspace }> {
  const row = await Workspace.find(userId, id);
  if (!row) {
    throwApiError(ApiErrorCode.NOT_FOUND, "Workspace not found");
  }
  requireReadable(row);

  if (path.startsWith("/")) {
    throwApiError(
      ApiErrorCode.INVALID_INPUT,
      "Absolute paths not allowed, use relative paths"
    );
  }

  const workspace = workspaceFromRow(row);
  if (!workspace) {
    throwApiError(
      ApiErrorCode.INTERNAL_ERROR,
      "Workspace storage is not configured"
    );
  }
  return { row, workspace };
}

/** Containment is the workspace's own rule; surface its refusal as a 403. */
function rethrowTraversal(err: unknown): never {
  if (err instanceof Error && err.name === "WorkspacePathError") {
    throwApiError(ApiErrorCode.FORBIDDEN, "Path traversal not allowed");
  }
  throw err;
}

export const workspaceRouter = router({
  list: protectedProcedure
    .input(listInput)
    .output(listOutput)
    .query(async ({ ctx, input }) => {
      // Listing creates the default workspace when the user has none, so the
      // editor never has to render a "no workspace" state. Runs do not use it:
      // they work in their project's folder.
      await Workspace.ensureDefault(ctx.userId);
      const page: Parameters<typeof Workspace.paginate>[1] = {
        limit: input.limit
      };
      if (input.project_id !== undefined) page.projectId = input.project_id;
      const [items] = await Workspace.paginate(ctx.userId, page);
      const readable = canManageWorkspaces()
        ? items
        : items.filter((ws) => ws.isManaged());
      return {
        workspaces: readable.map(toWorkspaceResponse),
        can_manage: canManageWorkspaces(),
        next: null
      };
    }),

  listFiles: protectedProcedure
    .input(listFilesInput)
    .output(listFilesOutput)
    .query(async ({ ctx, input }) => {
      const row = await Workspace.find(ctx.userId, input.id);
      if (!row) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Workspace not found");
      }
      requireReadable(row);

      if (input.path.startsWith("/")) {
        throwApiError(
          ApiErrorCode.INVALID_INPUT,
          "Absolute paths not allowed, use relative paths"
        );
      }

      // Listing goes through the workspace, so a cloud workspace (a prefix in
      // object storage) browses exactly like a local folder. Containment is
      // the workspace's own rule — there is no path arithmetic to get wrong
      // here any more.
      const workspace = workspaceFromRow(row);
      if (!workspace) {
        throwApiError(
          ApiErrorCode.INTERNAL_ERROR,
          "Workspace storage is not configured"
        );
      }

      let entries: WorkspaceEntry[];
      try {
        entries = await workspace.list(input.path === "." ? "" : input.path);
      } catch (err) {
        if (err instanceof Error && err.name === "WorkspacePathError") {
          throwApiError(ApiErrorCode.FORBIDDEN, "Path traversal not allowed");
        }
        throwApiError(ApiErrorCode.NOT_FOUND, "Directory not found");
      }

      // An empty listing is either an empty directory or a path that is not
      // there. Only a stat tells them apart, and the client shows a different
      // thing for each — an empty folder, or an error.
      if (entries.length === 0 && input.path !== "." && input.path !== "") {
        const info = await workspace.stat(input.path).catch(() => null);
        if (!info) {
          throwApiError(ApiErrorCode.NOT_FOUND, "Directory not found");
        }
      }

      const files: FileEntry[] = entries.map((entry) => ({
        name: entry.name,
        path: entry.path,
        size: entry.size,
        is_dir: entry.isDirectory,
        modified_at: new Date(entry.modifiedAt).toISOString()
      }));
      return files;
    }),

  /**
   * Read one workspace file as UTF-8 text, for the editor's file viewer.
   *
   * Files larger than `MAX_TEXT_FILE_BYTES` come back cut to that many bytes
   * with `truncated: true`; `size` always reports the whole file. Past
   * `MAX_READABLE_BYTES` nothing is read at all — slicing 2 MiB off a
   * multi-gigabyte file would still load the whole thing into memory first.
   */
  readFile: protectedProcedure
    .input(readFileInput)
    .output(readFileOutput)
    .query(async ({ ctx, input }) => {
      const { workspace } = await resolveFileTarget(
        ctx.userId,
        input.id,
        input.path
      );

      const info = await workspace.stat(input.path).catch(rethrowTraversal);
      if (!info) {
        throwApiError(ApiErrorCode.NOT_FOUND, "File not found");
      }
      if (info.isDirectory) {
        throwApiError(ApiErrorCode.INVALID_INPUT, "Path is a directory");
      }
      if (info.size > MAX_READABLE_BYTES) {
        throwApiError(
          ApiErrorCode.INVALID_INPUT,
          "File is too large to open as text"
        );
      }

      const bytes = await workspace.read(input.path).catch(rethrowTraversal);
      if (!bytes) {
        throwApiError(ApiErrorCode.NOT_FOUND, "File not found");
      }

      const truncated = bytes.byteLength > MAX_TEXT_FILE_BYTES;
      const slice = truncated
        ? bytes.subarray(0, MAX_TEXT_FILE_BYTES)
        : bytes;
      return {
        content: new TextDecoder().decode(slice),
        size: info.size,
        modified_at: new Date(info.modifiedAt).toISOString(),
        truncated
      };
    }),

  /**
   * Write UTF-8 text to a workspace file, creating it when absent.
   *
   * Guarded exactly like the read paths — a workspace this deployment refuses
   * to list is a workspace it refuses to write — plus the accessibility check,
   * since a row whose folder has gone missing would otherwise recreate it.
   */
  writeFile: protectedProcedure
    .input(writeFileInput)
    .output(writeFileOutput)
    .mutation(async ({ ctx, input }) => {
      const { row, workspace } = await resolveFileTarget(
        ctx.userId,
        input.id,
        input.path
      );
      if (!row.isAccessible()) {
        throwApiError(ApiErrorCode.FORBIDDEN, "Workspace is not accessible");
      }

      if (Buffer.byteLength(input.content, "utf8") > MAX_TEXT_FILE_BYTES) {
        throwApiError(ApiErrorCode.INVALID_INPUT, "File content is too large");
      }

      const existing = await workspace.stat(input.path).catch(rethrowTraversal);
      if (existing?.isDirectory) {
        throwApiError(ApiErrorCode.INVALID_INPUT, "Path is a directory");
      }

      await workspace
        .write(input.path, input.content, "text/plain; charset=utf-8")
        .catch(rethrowTraversal);

      const info = await workspace.stat(input.path);
      const size = info?.size ?? Buffer.byteLength(input.content, "utf8");
      const modifiedAt = info?.modifiedAt ?? Date.now();
      return {
        name: basename(input.path),
        path: input.path,
        size,
        is_dir: false,
        modified_at: new Date(modifiedAt).toISOString()
      };
    })
});
