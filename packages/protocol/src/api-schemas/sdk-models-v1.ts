import { z } from "zod";

export const sdkV1ModelAvailability = z.enum([
  "ready_local",
  "ready_remote",
  "downloadable",
  "downloading",
  "unavailable"
]);

export const sdkV1ModelScope = z.enum(["local", "worker"]);

export const sdkV1ModelCatalogQuery = z.object({
  compatibility: z.string().min(1).optional(),
  availability: sdkV1ModelAvailability.optional(),
  provider: z.string().min(1).optional(),
  scope: sdkV1ModelScope.optional().default("local"),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(200)
});

export const sdkV1ModelCatalogEntry = z.object({
  key: z.string().min(1),
  display_name: z.string().min(1),
  compatibility: z.string().min(1),
  availability: sdkV1ModelAvailability,
  recommended: z.boolean(),
  scope: sdkV1ModelScope,
  provider: z.string().nullable(),
  id: z.string().min(1),
  repo_id: z.string().nullable(),
  path: z.string().nullable(),
  supported_tasks: z.array(z.string()),
  size_on_disk: z.number().nonnegative().nullable(),
  wire_value: z.record(z.string(), z.unknown())
});

export const sdkV1ModelCatalog = z.object({
  version: z.literal("1"),
  catalog_revision: z.string().min(1),
  scope: sdkV1ModelScope,
  entries: z.array(sdkV1ModelCatalogEntry),
  next_cursor: z.string().nullable()
});

export type SdkV1ModelAvailability = z.infer<
  typeof sdkV1ModelAvailability
>;
export type SdkV1ModelScope = z.infer<typeof sdkV1ModelScope>;
export type SdkV1ModelCatalogQuery = z.infer<typeof sdkV1ModelCatalogQuery>;
export type SdkV1ModelCatalogEntry = z.infer<typeof sdkV1ModelCatalogEntry>;
export type SdkV1ModelCatalog = z.infer<typeof sdkV1ModelCatalog>;
