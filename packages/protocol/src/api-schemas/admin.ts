import { z } from "zod";

// ── Admin: the user directory ─────────────────────────────────────
// Every procedure is admin-only. A directory row exists for each person who
// has signed in through SSO.

export const adminUserRole = z.enum(["admin", "member"]);
export type AdminUserRole = z.infer<typeof adminUserRole>;

export const adminUserStatus = z.enum(["active", "disabled"]);
export type AdminUserStatus = z.infer<typeof adminUserStatus>;

// ── Quotas ───────────────────────────────────────────────────────
// Limits on spend through the server's own provider keys. Null is unlimited.

export const adminQuotaPeriod = z.enum(["day", "month"]);
export type AdminQuotaPeriod = z.infer<typeof adminQuotaPeriod>;

export const adminQuotaLimits = z.object({
  period: adminQuotaPeriod,
  /** Language-model tokens, input plus output. */
  token_limit: z.number().int().min(0).max(1e12).nullable(),
  /** Image, video, audio and 3D generation, in USD. */
  media_usd_limit: z.number().min(0).max(1e9).nullable()
});
export type AdminQuotaLimits = z.infer<typeof adminQuotaLimits>;

/** The limits in force for one user, and what they spent against them. */
export const adminUserQuota = adminQuotaLimits.extend({
  /** True when the user has limits of their own instead of the default. */
  custom: z.boolean(),
  /** Start of the current window, ISO. */
  since: z.string(),
  tokens_used: z.number(),
  media_usd_used: z.number()
});
export type AdminUserQuota = z.infer<typeof adminUserQuota>;

export const adminDefaultQuotaOutput = adminQuotaLimits.extend({
  /** False until an admin sets a default. Every limit is then null. */
  configured: z.boolean()
});
export type AdminDefaultQuotaOutput = z.infer<typeof adminDefaultQuotaOutput>;

export const adminUser = z.object({
  user_id: z.string(),
  email: z.string().nullable(),
  display_name: z.string().nullable(),
  auth_source: z.string(),
  groups: z.array(z.string()),
  /** The role an admin set by hand. */
  role: adminUserRole,
  /** True when the user is an admin by any route, including group and env. */
  is_admin: z.boolean(),
  status: adminUserStatus,
  created_at: z.string(),
  updated_at: z.string(),
  last_sign_in_at: z.string().nullable(),
  last_seen_at: z.string().nullable(),
  quota: adminUserQuota
});
export type AdminUser = z.infer<typeof adminUser>;

// ── users.list ───────────────────────────────────────────────────
export const adminUsersListInput = z
  .object({
    query: z.string().max(200).optional(),
    status: adminUserStatus.optional(),
    role: adminUserRole.optional(),
    limit: z.number().int().min(1).max(200).default(50),
    offset: z.number().int().min(0).default(0)
  })
  .default({ limit: 50, offset: 0 });
export type AdminUsersListInput = z.infer<typeof adminUsersListInput>;

export const adminUsersListOutput = z.object({
  users: z.array(adminUser),
  total: z.number().int()
});
export type AdminUsersListOutput = z.infer<typeof adminUsersListOutput>;

// ── users.get ────────────────────────────────────────────────────
export const adminUserRef = z.object({
  user_id: z.string().min(1).max(200)
});
export type AdminUserRef = z.infer<typeof adminUserRef>;

// ── users.update ─────────────────────────────────────────────────
export const adminUsersUpdateInput = adminUserRef.extend({
  role: adminUserRole.optional(),
  status: adminUserStatus.optional()
});
export type AdminUsersUpdateInput = z.infer<typeof adminUsersUpdateInput>;

// ── me ───────────────────────────────────────────────────────────
export const adminMeOutput = z.object({
  is_admin: z.boolean()
});
export type AdminMeOutput = z.infer<typeof adminMeOutput>;

// ── quotas.setDefault / quotas.setUser / quotas.clearUser ─────────
export const adminQuotasSetDefaultInput = adminQuotaLimits;
export type AdminQuotasSetDefaultInput = z.infer<
  typeof adminQuotasSetDefaultInput
>;

export const adminQuotasSetUserInput = adminUserRef.merge(adminQuotaLimits);
export type AdminQuotasSetUserInput = z.infer<typeof adminQuotasSetUserInput>;
