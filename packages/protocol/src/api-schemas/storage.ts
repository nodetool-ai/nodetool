/**
 * Zod schemas for the storage domain — JSON ops only.
 * Binary PUT/GET stay as REST.
 */
import { z } from "zod";

// ── storage.list ─────────────────────────────────────────────────────────────

export const storageEntrySchema = z.object({
  key: z.string(),
  size: z.number(),
  content_type: z.string(),
  last_modified: z.string()
});

export type StorageEntry = z.infer<typeof storageEntrySchema>;

export const listStorageInput = z.object({
  prefix: z.string().optional()
});

export const listStorageOutput = z.object({
  entries: z.array(storageEntrySchema),
  count: z.number()
});

export type ListStorageInput = z.infer<typeof listStorageInput>;
export type ListStorageOutput = z.infer<typeof listStorageOutput>;

// ── storage.metadata ─────────────────────────────────────────────────────────

export const storageMetadataInput = z.object({
  key: z.string().min(1)
});

export const storageMetadataOutput = storageEntrySchema;

export type StorageMetadataInput = z.infer<typeof storageMetadataInput>;
export type StorageMetadataOutput = z.infer<typeof storageMetadataOutput>;

// ── storage.signUrl ──────────────────────────────────────────────────────────

export const signUrlInput = z.object({
  key: z.string().min(1)
});

export const signUrlOutput = z.object({
  url: z.string()
});

export type SignUrlInput = z.infer<typeof signUrlInput>;
export type SignUrlOutput = z.infer<typeof signUrlOutput>;

// ── storage.delete ───────────────────────────────────────────────────────────

export const storageDeleteInput = z.object({
  key: z.string().min(1)
});

export const storageDeleteOutput = z.object({
  ok: z.literal(true)
});

export type StorageDeleteInput = z.infer<typeof storageDeleteInput>;
export type StorageDeleteOutput = z.infer<typeof storageDeleteOutput>;

// ── storage.allowance ────────────────────────────────────────────────────────
// The caller's storage use against the allowance (WP2.3, PRD D5). Use counts
// each distinct file in the caller's projects once, including files that only
// saved versions and deleted documents keep. A null allowance is unlimited.

export const storageAllowanceOutput = z.object({
  used_bytes: z.number(),
  file_count: z.number(),
  allowance_bytes: z.number().nullable(),
  /** Above the allowance: new generations and uploads are refused. */
  over_allowance: z.boolean(),
  /** At or above 90 percent of the allowance. */
  near_allowance: z.boolean()
});

export type StorageAllowanceOutput = z.infer<typeof storageAllowanceOutput>;

// ── storage.files ────────────────────────────────────────────────────────────
// The storage view: each counted file with its projects and what keeps it.

export const storageHolderSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("current"), document_type: z.string(), document_id: z.string() }),
  z.object({
    kind: z.literal("version"),
    document_type: z.string(),
    document_id: z.string(),
    version_id: z.string()
  }),
  z.object({
    kind: z.literal("deleted_document"),
    document_type: z.string(),
    document_id: z.string(),
    name: z.string(),
    purge_at: z.string()
  }),
  z.object({
    kind: z.literal("deleted_project"),
    project_id: z.string(),
    name: z.string(),
    purge_at: z.string()
  })
]);

export type StorageHolder = z.infer<typeof storageHolderSchema>;

export const storageFileSchema = z.object({
  hash: z.string(),
  size: z.number(),
  projects: z.array(z.object({ id: z.string(), name: z.string(), deleted: z.boolean() })),
  asset_ids: z.array(z.string()),
  /** Empty when nothing refers to the file. */
  holders: z.array(storageHolderSchema)
});

export type StorageFile = z.infer<typeof storageFileSchema>;

export const storageFilesOutput = z.object({
  files: z.array(storageFileSchema)
});

export type StorageFilesOutput = z.infer<typeof storageFilesOutput>;
