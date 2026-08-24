import { z } from "zod";

// ── SettingWithValue ──────────────────────────────────────────────
// Mirrors the response produced by `settings-api.ts :: handleGetSettings`.
// `value` is `unknown` (could be string from DB/env, or `"****"` / `null` for
// secrets) — kept as `unknown` for source-of-truth byte-identity with the
// legacy REST response.
export const settingWithValue = z.object({
  package_name: z.string(),
  env_var: z.string(),
  group: z.string(),
  description: z.string(),
  enum: z.array(z.string()).nullable(),
  value: z.unknown(),
  is_secret: z.boolean()
});
export type SettingWithValue = z.infer<typeof settingWithValue>;

// ── Secret response ───────────────────────────────────────────────
// Mirrors `toSecretResponse` in http-api.ts and the unconfigured-secret
// placeholder shape. `value` is optional (only present when GET by-key is
// called with `decrypt=true`).
export const secretResponse = z.object({
  id: z.string().optional(),
  user_id: z.string().optional(),
  key: z.string(),
  description: z.string().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  is_configured: z.boolean(),
  is_unreadable: z.boolean().optional(),
  value: z.string().optional()
});
export type SecretResponse = z.infer<typeof secretResponse>;

// ── list (GET /api/settings) ──────────────────────────────────────
export const listOutput = z.object({
  settings: z.array(settingWithValue)
});

// ── update (PUT /api/settings) ────────────────────────────────────
export const updateInput = z.object({
  settings: z.record(z.string(), z.unknown()).optional(),
  secrets: z.record(z.string(), z.unknown()).optional()
});
export type UpdateInput = z.infer<typeof updateInput>;

export const updateOutput = z.object({
  message: z.string()
});

// ── secrets.list (GET /api/settings/secrets) ──────────────────────
export const secretsListOutput = z.object({
  secrets: z.array(secretResponse),
  next_key: z.string().nullable()
});

// ── secrets.get (GET /api/settings/secrets/:key[?decrypt=true]) ──
export const secretGetInput = z.object({
  key: z.string().min(1),
  decrypt: z.boolean().default(false)
});
export type SecretGetInput = z.infer<typeof secretGetInput>;

// ── secrets.upsert (PUT /api/settings/secrets/:key) ──────────────
export const secretUpsertInput = z.object({
  key: z.string().min(1),
  value: z.string(),
  description: z.string().optional()
});
export type SecretUpsertInput = z.infer<typeof secretUpsertInput>;

// ── secrets.delete (DELETE /api/settings/secrets/:key) ───────────
export const secretDeleteInput = z.object({
  key: z.string().min(1)
});
export type SecretDeleteInput = z.infer<typeof secretDeleteInput>;

export const secretDeleteOutput = z.object({
  message: z.string()
});

// ── secrets.validate ──────────────────────────────────────────────
// Probes a provider credential against the provider's own listing endpoint.
// `value` is the candidate the user just typed; omit it to check the key
// already stored for this user.
export const secretValidateInput = z.object({
  key: z.string().min(1),
  value: z.string().optional()
});
export type SecretValidateInput = z.infer<typeof secretValidateInput>;

export const secretValidateOutput = z.object({
  /**
   * `valid` — the provider accepted it. `invalid` — the provider rejected it.
   * `unverifiable` — nothing was learned (no probe for this provider, timeout,
   * network failure, or a status that says nothing about the credential).
   */
  status: z.enum(["valid", "invalid", "unverifiable"]),
  /** True only for `valid` — kept so callers can branch without the enum. */
  valid: z.boolean(),
  message: z.string()
});
export type SecretValidateOutput = z.infer<typeof secretValidateOutput>;

// ── Local history retention and database maintenance ────────────────

export const storageRetentionPolicy = z.object({
  maxAutosavesPerWorkflow: z.number().int().min(1).max(500),
  autosaveRetentionDays: z.number().int().min(1).max(3650),
  manualVersionRetentionDays: z.number().int().min(1).max(3650),
  terminalJobRetentionDays: z.number().int().min(1).max(3650),
  automaticCleanup: z.boolean()
});
export type StorageRetentionPolicy = z.infer<typeof storageRetentionPolicy>;

export const storageCleanupPreview = z.object({
  autosaves: z.number().int().nonnegative(),
  manualVersions: z.number().int().nonnegative(),
  terminalJobs: z.number().int().nonnegative(),
  total: z.number().int().nonnegative()
});

export const storageStatus = z.object({
  dialect: z.enum(["sqlite", "postgres"]),
  databaseBytes: z.number().int().nonnegative().nullable(),
  unusedBytes: z.number().int().nonnegative().nullable(),
  workflowVersions: z.number().int().nonnegative(),
  autosaves: z.number().int().nonnegative(),
  manualVersions: z.number().int().nonnegative(),
  jobs: z.number().int().nonnegative(),
  terminalJobs: z.number().int().nonnegative(),
  cleanup: storageCleanupPreview
});

export const storageHistoryOutput = z.object({
  policy: storageRetentionPolicy,
  status: storageStatus,
  lastCleanupAt: z.string().nullable()
});

export const updateStorageHistoryInput = storageRetentionPolicy;

export const cleanupStorageHistoryOutput = z.object({
  deleted: storageCleanupPreview.extend({ completedAt: z.string() }),
  status: storageStatus
});

export const compactStorageHistoryOutput = z.object({
  status: storageStatus
});
