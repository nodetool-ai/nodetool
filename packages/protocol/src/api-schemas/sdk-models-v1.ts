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

export const sdkV1ModelDownloadStatus = z.enum([
  "start",
  "progress",
  "completed",
  "error",
  "cancelled"
]);

export const sdkV1ModelDownloadStartRequest = z
  .object({
    repo_id: z.string().min(1).max(512),
    path: z.string().min(1).max(2048).nullable().optional(),
    model_type: z.string().min(1).max(256),
    scope: sdkV1ModelScope.optional().default("local"),
    allow_patterns: z
      .array(z.string().min(1).max(512))
      .max(100)
      .nullable()
      .optional(),
    ignore_patterns: z
      .array(z.string().min(1).max(512))
      .max(100)
      .nullable()
      .optional()
  })
  .superRefine((value, context) => {
    if (value.path && value.allow_patterns) {
      context.addIssue({
        code: "custom",
        path: ["allow_patterns"],
        message: "allow_patterns is not supported when path is provided"
      });
    }
    if (value.path && value.ignore_patterns) {
      context.addIssue({
        code: "custom",
        path: ["ignore_patterns"],
        message: "ignore_patterns is not supported when path is provided"
      });
    }
  });

export const sdkV1ModelDownloadCancelRequest = z.object({
  operation_id: z.string().min(1).max(1024)
});

export const sdkV1ModelDownloadQuery = z.object({
  scope: sdkV1ModelScope.optional().default("local"),
  operation_id: z.string().min(1).max(1024).optional()
});

export const sdkV1ModelDownloadState = z.object({
  version: z.literal("1"),
  operation_id: z.string().min(1),
  scope: sdkV1ModelScope,
  repo_id: z.string().min(1),
  path: z.string().nullable(),
  model_type: z.string().min(1),
  status: sdkV1ModelDownloadStatus,
  downloaded_bytes: z.number().int().nonnegative(),
  total_bytes: z.number().int().nonnegative(),
  downloaded_files: z.number().int().nonnegative(),
  current_files: z.array(z.string()),
  total_files: z.number().int().nonnegative(),
  error: z.string().nullable(),
  started_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export const sdkV1ModelDownloadSnapshot = z.object({
  version: z.literal("1"),
  downloads: z.array(sdkV1ModelDownloadState)
});

export type SdkV1ModelAvailability = z.infer<typeof sdkV1ModelAvailability>;
export type SdkV1ModelScope = z.infer<typeof sdkV1ModelScope>;
export type SdkV1ModelCatalogQuery = z.infer<typeof sdkV1ModelCatalogQuery>;
export type SdkV1ModelCatalogEntry = z.infer<typeof sdkV1ModelCatalogEntry>;
export type SdkV1ModelCatalog = z.infer<typeof sdkV1ModelCatalog>;
export type SdkV1ModelDownloadStatus = z.infer<typeof sdkV1ModelDownloadStatus>;
export type SdkV1ModelDownloadStartRequest = z.infer<
  typeof sdkV1ModelDownloadStartRequest
>;
export type SdkV1ModelDownloadCancelRequest = z.infer<
  typeof sdkV1ModelDownloadCancelRequest
>;
export type SdkV1ModelDownloadQuery = z.infer<typeof sdkV1ModelDownloadQuery>;
export type SdkV1ModelDownloadState = z.infer<typeof sdkV1ModelDownloadState>;
export type SdkV1ModelDownloadSnapshot = z.infer<
  typeof sdkV1ModelDownloadSnapshot
>;
