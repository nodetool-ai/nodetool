/**
 * Workspace router — migrated from REST `/api/workspaces*`.
 *
 * NOTE: the binary-read endpoint `GET /api/workspaces/:id/download/:path` stays
 * on REST because tRPC's JSON link doesn't carry binary payloads. The other
 * CRUD + listFiles (which returns JSON metadata) endpoints move here.
 *
 * Pointing a workspace at an arbitrary host folder browses the local
 * filesystem, so create/update/delete are disabled in production via the
 * `NODETOOL_ENV=production` env var. Reading is not: every user has a default
 * workspace, and in production it is the server-managed folder under the data
 * dir — listing and downloading from that reaches nothing the deployment did
 * not create itself.
 */

import { stat, readdir, access } from "node:fs/promises";
import { existsSync, constants } from "node:fs";
import { resolve, relative, join, isAbsolute, sep } from "node:path";
import { Workspace } from "@nodetool-ai/models";
import { ApiErrorCode } from "../../error-codes.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";
import {
  listInput,
  listOutput,
  workspaceResponse,
  createInput,
  updateInput,
  deleteInput,
  deleteOutput,
  listFilesInput,
  listFilesOutput,
  type WorkspaceResponse,
  type FileEntry
} from "@nodetool-ai/protocol/api-schemas/workspace.js";
import { isObjectLike } from "../../lib/wire-values.js";

function toWorkspaceResponse(ws: Workspace): WorkspaceResponse {
  return {
    id: ws.id,
    user_id: ws.user_id,
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

/** Guard: choosing a workspace folder is disabled in production. */
function requireNonProduction(): void {
  if (!canManageWorkspaces()) {
    throwApiError(
      ApiErrorCode.FORBIDDEN,
      "Managing workspace folders is disabled in production"
    );
  }
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
 * Validate a workspace path: absolute, existing, a directory, and writable.
 * Shared by create and update so update can't repoint a workspace at an
 * arbitrary directory (e.g. /etc) and read it via listFiles.
 */
async function validateWorkspacePath(candidate: string): Promise<void> {
  if (!isAbsolute(candidate)) {
    throwApiError(ApiErrorCode.INVALID_INPUT, "Path must be absolute");
  }
  if (!existsSync(candidate)) {
    throwApiError(ApiErrorCode.INVALID_INPUT, "Path does not exist");
  }
  try {
    const s = await stat(candidate);
    if (!s.isDirectory()) {
      throwApiError(ApiErrorCode.INVALID_INPUT, "Path is not a directory");
    }
  } catch (err) {
    if (
      isObjectLike(err) &&
      "name" in err &&
      (err as { name: string }).name === "TRPCError"
    ) {
      throw err; // already a throwApiError result — rethrow
    }
    throwApiError(ApiErrorCode.INVALID_INPUT, "Cannot access path");
  }
  try {
    await access(candidate, constants.W_OK);
  } catch {
    throwApiError(ApiErrorCode.INVALID_INPUT, "Path is not writable");
  }
}

export const workspaceRouter = router({
  list: protectedProcedure
    .input(listInput)
    .output(listOutput)
    .query(async ({ ctx, input }) => {
      // Listing creates the default workspace when the user has none, so the
      // editor never has to render a "no workspace" state and a run always has
      // somewhere to write.
      await Workspace.ensureDefault(ctx.userId);
      const [items] = await Workspace.paginate(ctx.userId, {
        limit: input.limit
      });
      const readable = canManageWorkspaces()
        ? items
        : items.filter((ws) => ws.isManaged());
      return {
        workspaces: readable.map(toWorkspaceResponse),
        can_manage: canManageWorkspaces(),
        next: null
      };
    }),

  create: protectedProcedure
    .input(createInput)
    .output(workspaceResponse)
    .mutation(async ({ ctx, input }) => {
      requireNonProduction();

      await validateWorkspacePath(input.path);

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
      if (input.path !== undefined) {
        // Validate exactly as create does — otherwise a user could repoint
        // their workspace at any directory (/etc, /root) and enumerate/read it
        // via listFiles and the REST download endpoint.
        await validateWorkspacePath(input.path);
        ws.path = input.path;
      }
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

      if (ws.is_default) {
        throwApiError(
          ApiErrorCode.INVALID_INPUT,
          "Cannot delete the default workspace"
        );
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
      const workspace = await Workspace.find(ctx.userId, input.id);
      if (!workspace) {
        throwApiError(ApiErrorCode.NOT_FOUND, "Workspace not found");
      }
      requireReadable(workspace);

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
      // Segment-aware traversal check: a bare `startsWith("..")` also rejects a
      // legitimate in-workspace entry named e.g. `..config`. Only `..` alone or
      // a leading `../` segment actually escapes the workspace.
      if (rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel)) {
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
