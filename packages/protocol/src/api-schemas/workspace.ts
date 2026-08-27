import { z } from "zod";

// ── Workspace response ───────────────────────────────────────────
// Mirrors `toWorkspaceResponse` in workspace-api.ts.
export const workspaceResponse = z.object({
  id: z.string(),
  user_id: z.string(),
  name: z.string(),
  path: z.string(),
  is_default: z.boolean(),
  /** True when NodeTool owns this folder (the default one it creates itself). */
  is_managed: z.boolean(),
  is_accessible: z.boolean(),
  created_at: z.string(),
  updated_at: z.string()
});
export type WorkspaceResponse = z.infer<typeof workspaceResponse>;

// ── list (GET /api/workspaces) ───────────────────────────────────
export const listInput = z.object({
  limit: z.number().int().min(1).max(500).default(50)
});
export type ListInput = z.infer<typeof listInput>;

export const listOutput = z.object({
  workspaces: z.array(workspaceResponse),
  /**
   * Whether this deployment lets the user point a workspace at a host folder.
   * False in the cloud, where the managed workspace is the only one.
   */
  can_manage: z.boolean(),
  next: z.string().nullable()
});
export type ListOutput = z.infer<typeof listOutput>;

// ── getDefault (GET /api/workspaces/default) ─────────────────────
// Returns the workspace or null (never 404).
export const getDefaultOutput = workspaceResponse.nullable();
export type GetDefaultOutput = z.infer<typeof getDefaultOutput>;

// ── get (GET /api/workspaces/:id) ────────────────────────────────
export const getInput = z.object({
  id: z.string().min(1)
});
export type GetInput = z.infer<typeof getInput>;

// ── create (POST /api/workspaces) ────────────────────────────────
export const createInput = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  is_default: z.boolean().default(false)
});
export type CreateInput = z.infer<typeof createInput>;

// ── update (PUT /api/workspaces/:id) ─────────────────────────────
export const updateInput = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  path: z.string().optional(),
  is_default: z.boolean().optional()
});
export type UpdateInput = z.infer<typeof updateInput>;

// ── delete (DELETE /api/workspaces/:id) ──────────────────────────
export const deleteInput = z.object({
  id: z.string().min(1)
});
export type DeleteInput = z.infer<typeof deleteInput>;

export const deleteOutput = z.object({
  message: z.string()
});
export type DeleteOutput = z.infer<typeof deleteOutput>;

// ── listFiles (GET /api/workspaces/:id/files?path=.) ─────────────
// Returns an array of FileEntry objects — each describes a file or directory
// within the workspace. Only relative paths are accepted; absolute or
// traversal paths throw.
export const fileEntry = z.object({
  name: z.string(),
  path: z.string(),
  size: z.number(),
  is_dir: z.boolean(),
  modified_at: z.string()
});
export type FileEntry = z.infer<typeof fileEntry>;

export const listFilesInput = z.object({
  id: z.string().min(1),
  path: z.string().default(".")
});
export type ListFilesInput = z.infer<typeof listFilesInput>;

export const listFilesOutput = z.array(fileEntry);
export type ListFilesOutput = z.infer<typeof listFilesOutput>;

// ── readFile / writeFile (text view + editor) ────────────────────
/**
 * Largest text payload the read/write procedures carry, in bytes.
 *
 * These are for viewing and editing a file as text in the editor, not for
 * moving data: a read past this cap returns the first 2 MiB with
 * `truncated: true`, and a write past it is refused. Binary transfer stays on
 * `GET /api/workspaces/:id/download/:path`.
 */
export const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;

export const readFileInput = z.object({
  id: z.string().min(1),
  /** Workspace-relative. Absolute paths and traversal are refused. */
  path: z.string().min(1)
});
export type ReadFileInput = z.infer<typeof readFileInput>;

export const readFileOutput = z.object({
  /**
   * The file decoded as UTF-8. When `truncated` is true this is only the first
   * {@link MAX_TEXT_FILE_BYTES} bytes, so a multi-byte character straddling the
   * cut decodes to U+FFFD.
   */
  content: z.string(),
  /** Full size of the file on disk, not the length of `content`. */
  size: z.number(),
  modified_at: z.string(),
  truncated: z.boolean()
});
export type ReadFileOutput = z.infer<typeof readFileOutput>;

export const writeFileInput = z.object({
  id: z.string().min(1),
  /** Workspace-relative. Absolute paths and traversal are refused. */
  path: z.string().min(1),
  /** UTF-8 text. Refused when it encodes to more than {@link MAX_TEXT_FILE_BYTES}. */
  content: z.string()
});
export type WriteFileInput = z.infer<typeof writeFileInput>;

/** The entry as it stands after the write. */
export const writeFileOutput = fileEntry;
export type WriteFileOutput = z.infer<typeof writeFileOutput>;
