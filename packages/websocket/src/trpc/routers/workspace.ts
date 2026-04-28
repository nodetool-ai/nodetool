/**
 * Workspace router — migrated from REST `/api/workspaces*`.
 *
 * NOTE: the binary-read endpoint `GET /api/workspaces/:id/download/:path` stays
 * on REST because tRPC's JSON link doesn't carry binary payloads. The other
 * CRUD + listFiles (which returns JSON metadata) endpoints move here.
 *
 * Workspaces browse the local filesystem — disabled in production via the
 * `NODETOOL_ENV=production` env var.
 */

import { stat, readdir, access } from "node:fs/promises";
import { existsSync, constants } from "node:fs";
import { resolve, relative, join, isAbsolute } from "node:path";
import { Workspace } from "@nodetool/models";
import { ApiErrorCode } from "../../error-codes.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";
import {
  listInput,
  listOutput,
  getDefaultOutput,
  getInput,
  workspaceResponse,
  createInput,
  updateInput,
  deleteInput,
  deleteOutput,
  listFilesInput,
  listFilesOutput,
  type WorkspaceResponse,
  type FileEntry
} from "@nodetool/protocol/api-schemas/workspace.js";

function toWorkspaceResponse(ws: Workspace): WorkspaceResponse {
  return {
    id: ws.id,
    user_id: ws.user_id,
    name: ws.name,
    path: ws.path,
    is_default: ws.is_default,
    is_accessible: ws.isAccessible(),
    created_at: ws.created_at,
    updated_at: ws.updated_at
  };
}

/** Guard: workspace operations are disabled in production. */
function requireNonProduction(): void {
  if (process.env["NODETOOL_ENV"] === "production") {
    throwApiError(
      ApiErrorCode.FORBIDDEN,
      "Workspaces are disabled in production"
    );
  }
}

export const workspaceRouter = router({
  list: protectedProcedure
    .input(listInput)
    .output(listOutput)
    .query(async ({ ctx, input }) => {
      requireNonProduction();
      const [items] = await Workspace.paginate(ctx.userId, {
        limit: input.limit
      });
      return {
        workspaces: items.map(toWorkspaceResponse),
        next: null
      };
    }),

  getDefault: protectedProcedure
    .output(getDefaultOutput)
    .query(async ({ ctx }) => {
      requireNonProduction();
      const ws = await Workspace.getDefault(ctx.userId);
      return ws ? toWorkspaceResponse(ws) : null;
    }),

  get: protectedProcedure
    .input(getInput)
    .output(workspaceResponse)
    .query(async ({ ctx, input }) => {
      requireNonProduction();
      const ws = await Workspace.find(ctx.userId, input.id);
      if (!ws) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Workspace not found");
      }
      return toWorkspaceResponse(ws);
    }),

  create: protectedProcedure
    .input(createInput)
    .output(workspaceResponse)
    .mutation(async ({ ctx, input }) => {
      requireNonProduction();

      // Validate path
      if (!isAbsolute(input.path)) {
        throwApiError(ApiErrorCode.INVALID_INPUT, "Path must be absolute");
      }
      if (!existsSync(input.path)) {
        throwApiError(ApiErrorCode.INVALID_INPUT, "Path does not exist");
      }
      try {
        const s = await stat(input.path);
        if (!s.isDirectory()) {
          throwApiError(
            ApiErrorCode.INVALID_INPUT,
            "Path is not a directory"
          );
        }
      } catch (err) {
        // If stat itself failed (not the isDirectory check), surface as cannot access.
        if (
          err &&
          typeof err === "object" &&
          "name" in err &&
          (err as { name: string }).name === "TRPCError"
        ) {
          throw err; // already a throwApiError result — rethrow
        }
        throwApiError(ApiErrorCode.INVALID_INPUT, "Cannot access path");
      }
      try {
        await access(input.path, constants.W_OK);
      } catch {
        throwApiError(ApiErrorCode.INVALID_INPUT, "Path is not writable");
      }

      if (input.is_default) {
        await Workspace.unsetOtherDefaults(ctx.userId);
      }

      const ws = (await Workspace.create({
        user_id: ctx.userId,
        name: input.name,
        path: input.path,
        is_default: input.is_default
      })) as Workspace;

      return toWorkspaceResponse(ws);
    }),

  update: protectedProcedure
    .input(updateInput)
    .output(workspaceResponse)
    .mutation(async ({ ctx, input }) => {
      requireNonProduction();
      const ws = await Workspace.find(ctx.userId, input.id);
      if (!ws) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Workspace not found");
      }

      if (input.name !== undefined) ws.name = input.name;
      if (input.path !== undefined) ws.path = input.path;
      if (input.is_default !== undefined) {
        if (input.is_default) {
          await Workspace.unsetOtherDefaults(ctx.userId);
        }
        ws.is_default = input.is_default;
      }
      await ws.save();
      return toWorkspaceResponse(ws);
    }),

  delete: protectedProcedure
    .input(deleteInput)
    .output(deleteOutput)
    .mutation(async ({ ctx, input }) => {
      requireNonProduction();
      const ws = await Workspace.find(ctx.userId, input.id);
      if (!ws) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Workspace not found");
      }

      const hasWorkflows = await Workspace.hasLinkedWorkflows(input.id);
      if (hasWorkflows) {
        throwApiError(
          ApiErrorCode.INVALID_INPUT,
          "Cannot delete workspace with linked workflows"
        );
      }

      await ws.delete();
      return { message: "Workspace deleted successfully" };
    }),

  listFiles: protectedProcedure
    .input(listFilesInput)
    .output(listFilesOutput)
    .query(async ({ ctx, input }) => {
      requireNonProduction();
      const workspace = await Workspace.find(ctx.userId, input.id);
      if (!workspace) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Workspace not found");
      }

      const queryPath = input.path;
      if (queryPath.startsWith("/")) {
        throwApiError(
          ApiErrorCode.INVALID_INPUT,
          "Absolute paths not allowed, use relative paths"
        );
      }

      const workspacePath = resolve(workspace.path);
      const resolvedPath = resolve(join(workspacePath, queryPath));

      // Path traversal check — boundary-safe: a sibling like `/tmp/ws-evil`
      // would pass a naive `startsWith("/tmp/ws")`, so use `path.relative`
      // and require the result to be empty or a non-`..` relative path.
      const rel = relative(workspacePath, resolvedPath);
      if (rel.startsWith("..") || isAbsolute(rel)) {
        throwApiError(ApiErrorCode.FORBIDDEN, "Path traversal not allowed");
      }

      let entries: string[];
      try {
        entries = await readdir(resolvedPath);
      } catch {
        throwApiError(ApiErrorCode.NOT_FOUND, "Directory not found");
      }

      const files: FileEntry[] = [];
      for (const entry of entries) {
        const entryRelative = join(queryPath === "." ? "" : queryPath, entry);
        const fullPath = join(resolvedPath, entry);
        try {
          const s = await stat(fullPath);
          files.push({
            name: entry,
            path: entryRelative,
            size: s.size,
            is_dir: s.isDirectory(),
            modified_at: s.mtime.toISOString()
          });
        } catch {
          // skip inaccessible entries
        }
      }
      return files;
    })
});
