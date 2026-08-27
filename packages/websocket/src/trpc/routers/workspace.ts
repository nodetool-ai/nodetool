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

import { stat, access } from "node:fs/promises";
import { existsSync, constants } from "node:fs";
import { isAbsolute, basename } from "node:path";
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
  workspaceResponse,
  createInput,
  updateInput,
  deleteInput,
  deleteOutput,
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
