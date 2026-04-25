import { z } from "zod";

// ── Workspace response ───────────────────────────────────────────
// Mirrors `toWorkspaceResponse` in workspace-api.ts.
export const workspaceResponse = z.object({
  id: z.string(),
  user_id: z.string(),
  name: z.string(),
  path: z.string(),
  is_default: z.boolean(),
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
