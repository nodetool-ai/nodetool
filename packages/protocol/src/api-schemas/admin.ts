import { z } from "zod";

import { sharedDocumentTypeSchema } from "./document-sharing.js";
import { collaboratorRoleSchema, shareRoleSchema } from "./workflows.js";

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

// ── Permissions ──────────────────────────────────────────────────
// Flags an admin turns off per user or for everyone. A flag nobody set is
// allowed. Keep in step with PERMISSION_FLAGS in models.

export const adminPermissionFlag = z.enum([
  "use_llm",
  "generate_media",
  "use_server_keys",
  "manage_own_keys",
  "share_links",
  "share_public",
  "publish_apps",
  "install_packs"
]);
export type AdminPermissionFlag = z.infer<typeof adminPermissionFlag>;

/** Every flag with its value in force. */
export const adminPermissionFlags = z.record(adminPermissionFlag, z.boolean());
export type AdminPermissionFlags = z.infer<typeof adminPermissionFlags>;

/** The flags one level sets. A flag left out follows the level below. */
export const adminPermissionOverrides = z.partialRecord(
  adminPermissionFlag,
  z.boolean()
);
export type AdminPermissionOverrides = z.infer<typeof adminPermissionOverrides>;

export const adminUserPermissions = z.object({
  flags: adminPermissionFlags,
  /** The flags set for this user. Empty when they follow the default. */
  overrides: adminPermissionOverrides
});
export type AdminUserPermissions = z.infer<typeof adminUserPermissions>;

export const adminDefaultPermissionsOutput = z.object({
  /** What every user gets unless an admin set a flag for them. */
  flags: adminPermissionFlags,
  /** The flags the default sets. Empty while every flag is allowed. */
  overrides: adminPermissionOverrides
});
export type AdminDefaultPermissionsOutput = z.infer<
  typeof adminDefaultPermissionsOutput
>;

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
  quota: adminUserQuota,
  permissions: adminUserPermissions
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

// ── permissions.setDefault / permissions.setUser ──────────────────
// Each call replaces the overrides of its level.
export const adminPermissionsSetDefaultInput = z.object({
  overrides: adminPermissionOverrides
});
export type AdminPermissionsSetDefaultInput = z.infer<
  typeof adminPermissionsSetDefaultInput
>;

export const adminPermissionsSetUserInput = adminUserRef.extend({
  overrides: adminPermissionOverrides
});
export type AdminPermissionsSetUserInput = z.infer<
  typeof adminPermissionsSetUserInput
>;

// ── sharing.* ────────────────────────────────────────────────────
// What one person shares and what is shared with them, across every kind
// of document, for an admin to review and take back.

export const adminSharedDocumentType = z.enum([
  "workflow",
  ...sharedDocumentTypeSchema.options
]);
export type AdminSharedDocumentType = z.infer<typeof adminSharedDocumentType>;

export const adminSharedDocument = z.object({
  type: adminSharedDocumentType,
  id: z.string(),
  /** Null when the document no longer exists. */
  name: z.string().nullable(),
  owner_id: z.string()
});
export type AdminSharedDocument = z.infer<typeof adminSharedDocument>;

/** A person from the directory, or just an id when they have no row. */
export const adminPersonRef = z.object({
  user_id: z.string(),
  display_name: z.string().nullable(),
  email: z.string().nullable()
});
export type AdminPersonRef = z.infer<typeof adminPersonRef>;

export const adminShareLink = z.object({
  share_id: z.string(),
  document: adminSharedDocument,
  role: shareRoleSchema,
  created_at: z.string().nullable()
});
export type AdminShareLink = z.infer<typeof adminShareLink>;

export const adminShareGrant = z.object({
  document: adminSharedDocument,
  /** Who holds the access. */
  person: adminPersonRef,
  role: collaboratorRoleSchema,
  created_at: z.string().nullable()
});
export type AdminShareGrant = z.infer<typeof adminShareGrant>;

export const adminSharingForUserOutput = z.object({
  /** Active links the person created on their documents. */
  links: z.array(adminShareLink),
  /** People who can open the person's documents. */
  granted: z.array(adminShareGrant),
  /** Other people's documents the person can open. */
  received: z.array(adminShareGrant),
  /** The person's workflows that anyone can view. */
  public_workflows: z.array(adminSharedDocument)
});
export type AdminSharingForUserOutput = z.infer<typeof adminSharingForUserOutput>;

export const adminSharingRevokeLinkInput = z.object({
  type: adminSharedDocumentType,
  share_id: z.string().min(1)
});
export type AdminSharingRevokeLinkInput = z.infer<
  typeof adminSharingRevokeLinkInput
>;

export const adminSharingRemoveGrantInput = z.object({
  type: adminSharedDocumentType,
  document_id: z.string().min(1),
  user_id: z.string().min(1)
});
export type AdminSharingRemoveGrantInput = z.infer<
  typeof adminSharingRemoveGrantInput
>;

export const adminSharingMakePrivateInput = z.object({
  workflow_id: z.string().min(1)
});
export type AdminSharingMakePrivateInput = z.infer<
  typeof adminSharingMakePrivateInput
>;

export const adminSharingOkOutput = z.object({ ok: z.literal(true) });
