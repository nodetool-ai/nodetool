/**
 * Zod schemas for the files domain — local filesystem browser (JSON ops only).
 * Binary download (/api/files/download) stays as REST.
 */
import { z } from "zod";

// ── Shared types ────────────────────────────────────────────────────────────

export const fileEntrySchema = z.object({
  name: z.string(),
  /** Full absolute path to the entry */
  path: z.string(),
  size: z.number(),
  is_dir: z.boolean(),
  modified_at: z.string()
});

export type FileEntry = z.infer<typeof fileEntrySchema>;

// ── files.list ──────────────────────────────────────────────────────────────

export const listFilesInput = z.object({
  path: z.string().min(1)
});

export const listFilesOutput = z.array(fileEntrySchema);

export type ListFilesInput = z.infer<typeof listFilesInput>;
export type ListFilesOutput = z.infer<typeof listFilesOutput>;

// ── files.info ──────────────────────────────────────────────────────────────

export const fileInfoInput = z.object({
  path: z.string().min(1)
});

export const fileInfoOutput = fileEntrySchema;

export type FileInfoInput = z.infer<typeof fileInfoInput>;
export type FileInfoOutput = z.infer<typeof fileInfoOutput>;
