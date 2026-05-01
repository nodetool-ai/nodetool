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

// ── storage.delete ───────────────────────────────────────────────────────────

export const storageDeleteInput = z.object({
  key: z.string().min(1)
});

export const storageDeleteOutput = z.object({
  ok: z.literal(true)
});

export type StorageDeleteInput = z.infer<typeof storageDeleteInput>;
export type StorageDeleteOutput = z.infer<typeof storageDeleteOutput>;
