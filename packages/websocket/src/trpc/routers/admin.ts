/**
 * Admin router — the user directory of a self-hosted server.
 *
 * Procedures:
 *   me            (query)    — whether the caller is an admin (any user)
 *   users.list    (query)    — search and page the directory (admin)
 *   users.get     (query)    — one account (admin)
 *   users.update  (mutation) — set role or status (admin)
 *   quotas.getDefault (query)    — the limits every user gets (admin)
 *   quotas.setDefault (mutation) — change them (admin)
 *   quotas.setUser    (mutation) — give one user limits of their own (admin)
 *   quotas.clearUser  (mutation) — put one user back on the default (admin)
 *   permissions.getDefault (query)    — the flags every user gets (admin)
 *   permissions.setDefault (mutation) — change them (admin)
 *   permissions.setUser    (mutation) — set flags for one user (admin)
 *   sharing.forUser        (query)    — what one person shares and holds (admin)
 *   sharing.revokeLink     (mutation) — stop a share link (admin)
 *   sharing.removeGrant    (mutation) — take back one person's access (admin)
 *   sharing.makePrivate    (mutation) — make a public workflow private (admin)
 *
 * Disabling an account takes effect on this process at once: the cached
 * status is dropped and the user's open WebSockets are closed. Other replicas
 * follow within `ACCOUNT_STATUS_TTL_MS`. An admin cannot disable or demote
 * themselves, so a server cannot lose its last admin from the UI.
 *
 * Quota changes reach this process's gate at once and other replicas within
 * `QUOTA_CACHE_TTL_MS`. Permission changes likewise, within
 * `PERMISSION_CACHE_TTL_MS`.
 */

import {
  DocumentCollaborator,
  DocumentShare,
  Workflow,
  WorkflowCollaborator,
  WorkflowShare,
  getUserAccounts,
  getUserSharing,
  listPublicWorkflows,
  DEFAULT_PERMISSION_SUBJECT,
  DEFAULT_QUOTA_SUBJECT,
  getEffectivePermissions,
  getPermissionOverrides,
  resolvePermissions,
  setPermissionOverrides,
  clearQuota,
  getEffectiveQuota,
  getQuota,
  getUserAccount,
  listUserAccounts,
  quotaUsage,
  setQuota,
  updateUserAccount,
  type UserAccount,
  type UserQuota
} from "@nodetool-ai/models";
import {
  adminMeOutput,
  adminUser,
  adminUserRef,
  adminUsersListInput,
  adminUsersListOutput,
  adminUsersUpdateInput,
  adminDefaultQuotaOutput,
  adminQuotasSetDefaultInput,
  adminQuotasSetUserInput,
  adminUserQuota,
  adminDefaultPermissionsOutput,
  adminPermissionsSetDefaultInput,
  adminPermissionsSetUserInput,
  adminUserPermissions,
  adminSharingForUserOutput,
  adminSharingMakePrivateInput,
  adminSharingOkOutput,
  adminSharingRemoveGrantInput,
  adminSharingRevokeLinkInput,
  type AdminSharedDocument,
  type AdminSharedDocumentType,
  type AdminQuotaLimits,
  type AdminUser,
  type AdminUserQuota
} from "@nodetool-ai/protocol/api-schemas/admin.js";
import { ApiErrorCode } from "../../error-codes.js";
import { isAdmin } from "../../lib/admin.js";
import {
  closeUserSockets,
  forgetAccountStatus
} from "../../lib/user-directory.js";
import { forgetPermissions } from "../../lib/permissions.js";
import {
  invalidateSharedAssets,
  loadSharedDocument
} from "../../lib/document-access.js";
import { forgetQuota } from "../../quota-gate.js";
import { throwApiError } from "../error-formatter.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";

async function requireAdmin(userId: string): Promise<void> {
  if (!(await isAdmin(userId))) {
    throwApiError(ApiErrorCode.FORBIDDEN, "Admin access required");
  }
}

const toLimits = (quota: UserQuota | null): AdminQuotaLimits => ({
  period: quota?.period ?? "month",
  token_limit: quota?.tokenLimit ?? null,
  media_usd_limit: quota?.mediaUsdLimit ?? null
});

async function userQuota(userId: string): Promise<AdminUserQuota> {
  const { quota, custom } = await getEffectiveQuota(userId);
  const limits = toLimits(quota);
  const usage = await quotaUsage(userId, limits.period);
  return {
    ...limits,
    custom,
    since: usage.since,
    tokens_used: usage.tokens,
    media_usd_used: usage.mediaUsd
  };
}

const quotaChange = (input: AdminQuotaLimits) => ({
  period: input.period,
  tokenLimit: input.token_limit,
  mediaUsdLimit: input.media_usd_limit
});

async function requireAccount(userId: string): Promise<void> {
  if (!(await getUserAccount(userId))) {
    throwApiError(ApiErrorCode.NOT_FOUND, "User not found");
  }
}

async function toAdminUser(account: UserAccount): Promise<AdminUser> {
  return {
    user_id: account.userId,
    email: account.email,
    display_name: account.displayName,
    auth_source: account.authSource,
    groups: account.groups,
    role: account.role,
    is_admin: await isAdmin(account.userId),
    status: account.status,
    created_at: account.createdAt,
    updated_at: account.updatedAt,
    last_sign_in_at: account.lastSignInAt,
    last_seen_at: account.lastSeenAt,
    quota: await userQuota(account.userId),
    permissions: await getEffectivePermissions(account.userId)
  };
}

/** Names the documents behind a set of grants and links, loading each once. */
function documentNamer() {
  const seen = new Map<string, Promise<AdminSharedDocument>>();
  return (
    type: AdminSharedDocumentType,
    id: string,
    fallbackOwner: string
  ): Promise<AdminSharedDocument> => {
    const key = `${type}:${id}`;
    let found = seen.get(key);
    if (!found) {
      found = (async () => {
        const row =
          type === "workflow"
            ? ((await Workflow.get(id)) as Workflow | null)
            : await loadSharedDocument(type, id);
        return {
          type,
          id,
          name: row?.name ?? null,
          owner_id: row?.user_id ?? fallbackOwner
        };
      })();
      seen.set(key, found);
    }
    return found;
  };
}

async function defaultPermissions() {
  const overrides = await getPermissionOverrides(DEFAULT_PERMISSION_SUBJECT);
  return { flags: resolvePermissions(overrides), overrides };
}

export const adminRouter = router({
  me: protectedProcedure.output(adminMeOutput).query(async ({ ctx }) => ({
    is_admin: await isAdmin(ctx.userId)
  })),

  users: router({
    list: protectedProcedure
      .input(adminUsersListInput)
      .output(adminUsersListOutput)
      .query(async ({ ctx, input }) => {
        await requireAdmin(ctx.userId);
        const page = await listUserAccounts({
          query: input.query,
          status: input.status,
          role: input.role,
          limit: input.limit,
          offset: input.offset
        });
        return {
          users: await Promise.all(page.accounts.map(toAdminUser)),
          total: page.total
        };
      }),

    get: protectedProcedure
      .input(adminUserRef)
      .output(adminUser)
      .query(async ({ ctx, input }) => {
        await requireAdmin(ctx.userId);
        const account = await getUserAccount(input.user_id);
        if (!account) throwApiError(ApiErrorCode.NOT_FOUND, "User not found");
        return toAdminUser(account);
      }),

    update: protectedProcedure
      .input(adminUsersUpdateInput)
      .output(adminUser)
      .mutation(async ({ ctx, input }) => {
        await requireAdmin(ctx.userId);
        if (input.user_id === ctx.userId) {
          if (input.status === "disabled") {
            throwApiError(
              ApiErrorCode.INVALID_INPUT,
              "You cannot disable your own account."
            );
          }
          if (input.role === "member") {
            throwApiError(
              ApiErrorCode.INVALID_INPUT,
              "You cannot remove your own admin role."
            );
          }
        }
        const account = await updateUserAccount(input.user_id, {
          role: input.role,
          status: input.status
        });
        if (!account) throwApiError(ApiErrorCode.NOT_FOUND, "User not found");
        forgetAccountStatus(account.userId);
        if (account.status === "disabled") closeUserSockets(account.userId);
        return toAdminUser(account);
      })
  }),

  quotas: router({
    getDefault: protectedProcedure
      .output(adminDefaultQuotaOutput)
      .query(async ({ ctx }) => {
        await requireAdmin(ctx.userId);
        const quota = await getQuota(DEFAULT_QUOTA_SUBJECT);
        return { ...toLimits(quota), configured: quota !== null };
      }),

    setDefault: protectedProcedure
      .input(adminQuotasSetDefaultInput)
      .output(adminDefaultQuotaOutput)
      .mutation(async ({ ctx, input }) => {
        await requireAdmin(ctx.userId);
        const quota = await setQuota(
          DEFAULT_QUOTA_SUBJECT,
          quotaChange(input),
          ctx.userId
        );
        forgetQuota();
        return { ...toLimits(quota), configured: true };
      }),

    setUser: protectedProcedure
      .input(adminQuotasSetUserInput)
      .output(adminUserQuota)
      .mutation(async ({ ctx, input }) => {
        await requireAdmin(ctx.userId);
        await requireAccount(input.user_id);
        await setQuota(input.user_id, quotaChange(input), ctx.userId);
        forgetQuota(input.user_id);
        return userQuota(input.user_id);
      }),

    clearUser: protectedProcedure
      .input(adminUserRef)
      .output(adminUserQuota)
      .mutation(async ({ ctx, input }) => {
        await requireAdmin(ctx.userId);
        await requireAccount(input.user_id);
        await clearQuota(input.user_id);
        forgetQuota(input.user_id);
        return userQuota(input.user_id);
      })
  }),

  permissions: router({
    getDefault: protectedProcedure
      .output(adminDefaultPermissionsOutput)
      .query(async ({ ctx }) => {
        await requireAdmin(ctx.userId);
        return defaultPermissions();
      }),

    setDefault: protectedProcedure
      .input(adminPermissionsSetDefaultInput)
      .output(adminDefaultPermissionsOutput)
      .mutation(async ({ ctx, input }) => {
        await requireAdmin(ctx.userId);
        await setPermissionOverrides(
          DEFAULT_PERMISSION_SUBJECT,
          input.overrides,
          ctx.userId
        );
        forgetPermissions();
        return defaultPermissions();
      }),

    setUser: protectedProcedure
      .input(adminPermissionsSetUserInput)
      .output(adminUserPermissions)
      .mutation(async ({ ctx, input }) => {
        await requireAdmin(ctx.userId);
        await requireAccount(input.user_id);
        await setPermissionOverrides(input.user_id, input.overrides, ctx.userId);
        forgetPermissions(input.user_id);
        return getEffectivePermissions(input.user_id);
      })
  }),

  sharing: router({
    forUser: protectedProcedure
      .input(adminUserRef)
      .output(adminSharingForUserOutput)
      .query(async ({ ctx, input }) => {
        await requireAdmin(ctx.userId);
        const userId = input.user_id;
        const [sharing, publicWorkflows] = await Promise.all([
          getUserSharing(userId),
          listPublicWorkflows(userId)
        ]);
        const name = documentNamer();
        const people = await getUserAccounts([
          ...sharing.workflowGrantsGiven.map((grant) => grant.user_id),
          ...sharing.documentGrantsGiven.map((grant) => grant.user_id),
          ...sharing.workflowGrantsHeld.map((grant) => grant.user_id)
        ]);
        const person = (id: string) => ({
          user_id: id,
          display_name: people.get(id)?.displayName ?? null,
          email: people.get(id)?.email ?? null
        });

        const links = await Promise.all([
          ...sharing.workflowLinks.map(async (share) => ({
            share_id: share.id,
            document: await name("workflow", share.workflow_id, userId),
            role: share.role,
            created_at: share.created_at ?? null
          })),
          ...sharing.documentLinks.map(async (share) => ({
            share_id: share.id,
            document: await name(share.document_type, share.document_id, userId),
            role: share.role,
            created_at: share.created_at ?? null
          }))
        ]);
        const granted = await Promise.all([
          ...sharing.workflowGrantsGiven.map(async (grant) => ({
            document: await name("workflow", grant.workflow_id, userId),
            person: person(grant.user_id),
            role: grant.role,
            created_at: grant.created_at ?? null
          })),
          ...sharing.documentGrantsGiven.map(async (grant) => ({
            document: await name(grant.document_type, grant.document_id, userId),
            person: person(grant.user_id),
            role: grant.role,
            created_at: grant.created_at ?? null
          }))
        ]);
        const received = await Promise.all([
          ...sharing.workflowGrantsHeld.map(async (grant) => ({
            document: await name("workflow", grant.workflow_id, grant.invited_by),
            person: person(grant.user_id),
            role: grant.role,
            created_at: grant.created_at ?? null
          })),
          ...sharing.documentGrantsHeld.map(async (grant) => ({
            document: await name(
              grant.document_type,
              grant.document_id,
              grant.invited_by
            ),
            person: person(grant.user_id),
            role: grant.role,
            created_at: grant.created_at ?? null
          }))
        ]);
        return {
          links,
          granted,
          received,
          public_workflows: publicWorkflows.map((workflow) => ({
            type: "workflow" as const,
            id: workflow.id,
            name: workflow.name,
            owner_id: userId
          }))
        };
      }),

    revokeLink: protectedProcedure
      .input(adminSharingRevokeLinkInput)
      .output(adminSharingOkOutput)
      .mutation(async ({ ctx, input }) => {
        await requireAdmin(ctx.userId);
        let share: WorkflowShare | DocumentShare | null;
        if (input.type === "workflow") {
          share = (await WorkflowShare.get(input.share_id)) as WorkflowShare | null;
        } else {
          const link = (await DocumentShare.get(input.share_id)) as DocumentShare | null;
          share = link?.document_type === input.type ? link : null;
        }
        if (!share) {
          throwApiError(ApiErrorCode.NOT_FOUND, "Share link not found");
        }
        if (!share.isRevoked) await share.revoke();
        return { ok: true as const };
      }),

    removeGrant: protectedProcedure
      .input(adminSharingRemoveGrantInput)
      .output(adminSharingOkOutput)
      .mutation(async ({ ctx, input }) => {
        await requireAdmin(ctx.userId);
        const removed =
          input.type === "workflow"
            ? await WorkflowCollaborator.remove(input.document_id, input.user_id)
            : await DocumentCollaborator.remove(
                input.type,
                input.document_id,
                input.user_id
              );
        if (!removed) {
          throwApiError(ApiErrorCode.NOT_FOUND, "Access not found");
        }
        invalidateSharedAssets(input.user_id);
        return { ok: true as const };
      }),

    makePrivate: protectedProcedure
      .input(adminSharingMakePrivateInput)
      .output(adminSharingOkOutput)
      .mutation(async ({ ctx, input }) => {
        await requireAdmin(ctx.userId);
        const workflow = (await Workflow.get(input.workflow_id)) as Workflow | null;
        if (!workflow) {
          throwApiError(ApiErrorCode.WORKFLOW_NOT_FOUND, "Workflow not found");
        }
        if (workflow.access === "public") {
          workflow.access = "private";
          await workflow.save();
        }
        return { ok: true as const };
      })
  })
});
