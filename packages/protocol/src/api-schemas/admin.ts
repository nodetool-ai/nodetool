import { z } from "zod";

// ── Admin: the user directory ─────────────────────────────────────
// Every procedure is admin-only. A directory row exists for each person who
// has signed in through SSO.

export const adminUserRole = z.enum(["admin", "member"]);
export type AdminUserRole = z.infer<typeof adminUserRole>;

export const adminUserStatus = z.enum(["active", "disabled"]);
export type AdminUserStatus = z.infer<typeof adminUserStatus>;

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
  last_seen_at: z.string().nullable()
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
