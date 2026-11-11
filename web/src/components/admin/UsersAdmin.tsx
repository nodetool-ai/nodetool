import React, { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  ADMIN_PERMISSION_FLAGS,
  useAdminDefaultPermissions,
  useAdminDefaultQuota,
  useAdminUsers,
  useSetDefaultQuota,
  useSetPermissions,
  useSetUserQuota,
  useUpdateAdminUser,
  type AdminPermissionFlag,
  type AdminPermissionOverrides,
  type AdminQuotaLimits,
  type AdminUser,
  type AdminUserChange,
  type AdminUserQuota,
  type AdminUserStatus
} from "../../serverState/useAdminUsers";
import {
  AlertBanner,
  Box,
  Caption,
  Chip,
  ConfirmDialog,
  DataTable,
  EditorButton,
  EmptyState,
  FlexColumn,
  FlexRow,
  GAP,
  LoadingSpinner,
  SearchInput,
  SelectField,
  StatusPill,
  Text,
  type DataTableColumn
} from "../ui_primitives";
import { formatDateTime } from "../../utils/formatUtils";
import PermissionsDialog from "./PermissionsDialog";
import SharingDialog from "./SharingDialog";
import QuotaDialog from "./QuotaDialog";

const PAGE_SIZE = 50;

type StatusFilter = AdminUserStatus | "all";

interface PendingChange extends AdminUserChange {
  label: string;
}

const userLabel = (user: AdminUser): string =>
  user.display_name ?? user.email ?? user.user_id;

const formatTokens = (value: number): string =>
  Math.round(value).toLocaleString();

const formatUsd = (value: number): string => `$${value.toFixed(2)}`;

const errorText = (error: unknown): string | null =>
  error instanceof Error ? error.message : null;

/** Whose limits or permissions the open dialog edits: the default, or one user's. */
type QuotaTarget = { kind: "default" } | { kind: "user"; user: AdminUser };
type PermissionsTarget = QuotaTarget;

const EMPTY_OVERRIDES: AdminPermissionOverrides = {};
const ALL_ALLOWED = Object.fromEntries(
  ADMIN_PERMISSION_FLAGS.map((flag) => [flag, true])
) as Record<AdminPermissionFlag, boolean>;

const blockedCount = (flags: Record<string, boolean>): number =>
  Object.values(flags).filter((allowed) => !allowed).length;

const limitsOf = (quota: AdminUserQuota): AdminQuotaLimits => ({
  period: quota.period,
  token_limit: quota.token_limit,
  media_usd_limit: quota.media_usd_limit
});

/**
 * The Users tab of the admin area: search the directory, then promote,
 * demote, disable or re-enable an account. Disabling asks first, because it
 * signs the person out everywhere at once.
 */
const UsersAdmin: React.FC = () => {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [offset, setOffset] = useState(0);
  const [pendingDisable, setPendingDisable] = useState<PendingChange | null>(
    null
  );

  const [quotaTarget, setQuotaTarget] = useState<QuotaTarget | null>(null);
  const [permissionsTarget, setPermissionsTarget] =
    useState<PermissionsTarget | null>(null);
  const [sharingTarget, setSharingTarget] = useState<AdminUser | null>(null);

  const users = useAdminUsers({ query, status, offset, limit: PAGE_SIZE });
  const update = useUpdateAdminUser();
  const defaultQuota = useAdminDefaultQuota();
  const setDefaultQuota = useSetDefaultQuota();
  const setUserQuota = useSetUserQuota();
  const defaultPermissions = useAdminDefaultPermissions();
  const setPermissions = useSetPermissions();

  const defaultBlocked = blockedCount(defaultPermissions.data?.flags ?? {});

  const closePermissions = useCallback(() => {
    setPermissionsTarget(null);
    setPermissions.reset();
  }, [setPermissions]);

  const savePermissions = useCallback(
    (overrides: AdminPermissionOverrides) => {
      if (!permissionsTarget) return;
      setPermissions.mutate(
        {
          userId:
            permissionsTarget.kind === "user"
              ? permissionsTarget.user.user_id
              : null,
          overrides
        },
        { onSuccess: () => setPermissionsTarget(null) }
      );
    },
    [permissionsTarget, setPermissions]
  );

  const usageLine = useCallback(
    (used: string, limit: string | null) =>
      limit === null
        ? t("admin.quotas.usedNoLimit", { used })
        : t("admin.quotas.usedOf", { used, limit }),
    [t]
  );

  const defaultSummary = useMemo(() => {
    const quota = defaultQuota.data;
    if (!quota || (quota.token_limit === null && quota.media_usd_limit === null)) {
      return t("admin.quotas.defaultNone");
    }
    return t(
      quota.period === "day"
        ? "admin.quotas.defaultSummaryDay"
        : "admin.quotas.defaultSummaryMonth",
      {
        tokens:
          quota.token_limit === null
            ? t("admin.quotas.unlimited")
            : formatTokens(quota.token_limit),
        media:
          quota.media_usd_limit === null
            ? t("admin.quotas.unlimited")
            : formatUsd(quota.media_usd_limit)
      }
    );
  }, [defaultQuota.data, t]);

  const quotaInitial = useMemo((): AdminQuotaLimits => {
    if (quotaTarget?.kind === "user") return limitsOf(quotaTarget.user.quota);
    const quota = defaultQuota.data;
    return {
      period: quota?.period ?? "month",
      token_limit: quota?.token_limit ?? null,
      media_usd_limit: quota?.media_usd_limit ?? null
    };
  }, [quotaTarget, defaultQuota.data]);

  const quotaMutation =
    quotaTarget?.kind === "user" ? setUserQuota : setDefaultQuota;

  const closeQuota = useCallback(() => {
    setQuotaTarget(null);
    setUserQuota.reset();
    setDefaultQuota.reset();
  }, [setUserQuota, setDefaultQuota]);

  const saveQuota = useCallback(
    (limits: AdminQuotaLimits | null) => {
      if (!quotaTarget) return;
      const done = { onSuccess: () => setQuotaTarget(null) };
      if (quotaTarget.kind === "user") {
        setUserQuota.mutate({ userId: quotaTarget.user.user_id, limits }, done);
      } else if (limits) {
        setDefaultQuota.mutate(limits, done);
      }
    },
    [quotaTarget, setUserQuota, setDefaultQuota]
  );

  const applyChange = useCallback(
    (change: AdminUserChange) => {
      update.mutate(change);
    },
    [update]
  );

  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    setOffset(0);
  }, []);

  const handleStatus = useCallback((value: string) => {
    setStatus(value === "active" || value === "disabled" ? value : "all");
    setOffset(0);
  }, []);

  const statusOptions = useMemo(
    () => [
      { value: "all", label: t("admin.users.filter.all") },
      { value: "active", label: t("admin.users.filter.active") },
      { value: "disabled", label: t("admin.users.filter.disabled") }
    ],
    [t]
  );

  const columns: DataTableColumn[] = useMemo(
    () => [
      { key: "person", label: t("admin.users.columns.person") },
      { key: "role", label: t("admin.users.columns.role") },
      { key: "status", label: t("admin.users.columns.status") },
      { key: "usage", label: t("admin.users.columns.usage") },
      { key: "lastSeen", label: t("admin.users.columns.lastSeen") },
      { key: "actions", label: t("admin.users.columns.actions"), align: "right" }
    ],
    [t]
  );

  const rows = useMemo(
    () =>
      (users.data?.users ?? []).map((user) => {
        const busy = update.isPending && update.variables?.userId === user.user_id;
        const roleLabel = user.is_admin
          ? t("admin.users.role.admin")
          : t("admin.users.role.member");
        const viaGroup = user.is_admin && user.role !== "admin";
        return {
          id: user.user_id,
          person: (
            <FlexColumn gap={GAP.tight}>
              <FlexColumn gap={GAP.none}>
                <Text>{userLabel(user)}</Text>
                {user.email && user.display_name ? (
                  <Caption>{user.email}</Caption>
                ) : null}
              </FlexColumn>
              {user.groups.length > 0 ? (
                <FlexRow gap={GAP.tight} wrap>
                  {user.groups.map((group) => (
                    <Chip key={group} label={group} compact />
                  ))}
                </FlexRow>
              ) : null}
            </FlexColumn>
          ),
          role: (
            <FlexColumn gap={GAP.none}>
              <Chip
                label={roleLabel}
                compact
                color={user.is_admin ? "primary" : "default"}
              />
              {viaGroup ? <Caption>{t("admin.users.role.viaGroup")}</Caption> : null}
              {!user.is_admin && blockedCount(user.permissions.flags) > 0 ? (
                <Caption>
                  {t("admin.permissions.blockedCount", {
                    count: blockedCount(user.permissions.flags)
                  })}
                </Caption>
              ) : null}
            </FlexColumn>
          ),
          status: (
            <StatusPill tone={user.status === "active" ? "done" : "failed"}>
              {user.status === "active"
                ? t("admin.users.status.active")
                : t("admin.users.status.disabled")}
            </StatusPill>
          ),
          usage: (
            <FlexColumn gap={GAP.none} sx={{ whiteSpace: "nowrap" }}>
              <Caption>
                {t("admin.quotas.tokensLabel")}{" "}
                {usageLine(
                  formatTokens(user.quota.tokens_used),
                  user.quota.token_limit === null
                    ? null
                    : formatTokens(user.quota.token_limit)
                )}
              </Caption>
              <Caption>
                {t("admin.quotas.mediaLabel")}{" "}
                {usageLine(
                  formatUsd(user.quota.media_usd_used),
                  user.quota.media_usd_limit === null
                    ? null
                    : formatUsd(user.quota.media_usd_limit)
                )}
              </Caption>
              {user.quota.custom ? (
                <Caption>{t("admin.quotas.ownLimits")}</Caption>
              ) : null}
            </FlexColumn>
          ),
          lastSeen: (
            <Caption sx={{ whiteSpace: "nowrap" }}>
              {user.last_seen_at
                ? formatDateTime(user.last_seen_at)
                : t("admin.users.never")}
            </Caption>
          ),
          actions: (
            <FlexRow gap={GAP.tight} justify="flex-end" sx={{ whiteSpace: "nowrap" }}>
              <EditorButton
                variant="text"
                onClick={() => setQuotaTarget({ kind: "user", user })}
              >
                {t("admin.quotas.editLimits")}
              </EditorButton>
              <EditorButton
                variant="text"
                disabled={user.is_admin}
                onClick={() => setPermissionsTarget({ kind: "user", user })}
              >
                {t("admin.permissions.edit")}
              </EditorButton>
              <EditorButton variant="text" onClick={() => setSharingTarget(user)}>
                {t("admin.sharing.open")}
              </EditorButton>
              {user.role === "admin" ? (
                <EditorButton
                  variant="text"
                  disabled={busy}
                  onClick={() =>
                    applyChange({ userId: user.user_id, role: "member" })
                  }
                >
                  {t("admin.users.actions.removeAdmin")}
                </EditorButton>
              ) : (
                <EditorButton
                  variant="text"
                  disabled={busy || user.status !== "active"}
                  onClick={() =>
                    applyChange({ userId: user.user_id, role: "admin" })
                  }
                >
                  {t("admin.users.actions.makeAdmin")}
                </EditorButton>
              )}
              {user.status === "active" ? (
                <EditorButton
                  variant="outlined"
                  color="error"
                  disabled={busy}
                  onClick={() =>
                    setPendingDisable({
                      userId: user.user_id,
                      status: "disabled",
                      label: userLabel(user)
                    })
                  }
                >
                  {t("admin.users.actions.disable")}
                </EditorButton>
              ) : (
                <EditorButton
                  variant="outlined"
                  disabled={busy}
                  onClick={() =>
                    applyChange({ userId: user.user_id, status: "active" })
                  }
                >
                  {t("admin.users.actions.enable")}
                </EditorButton>
              )}
            </FlexRow>
          )
        };
      }),
    [users.data, update.isPending, update.variables, applyChange, usageLine, t]
  );

  const total = users.data?.total ?? 0;
  const shown = users.data?.users.length ?? 0;
  const filtered = query.trim() !== "" || status !== "all";

  let body: React.ReactNode;
  if (users.isLoading) {
    body = <LoadingSpinner />;
  } else if (users.isError) {
    body = (
      <EmptyState
        variant="error"
        title={t("admin.users.loadFailed")}
        description={users.error instanceof Error ? users.error.message : undefined}
        actionText={t("admin.users.retry")}
        onAction={() => void users.refetch()}
      />
    );
  } else if (total === 0) {
    body = filtered ? (
      <EmptyState variant="no-results" title={t("admin.users.noMatches")} />
    ) : (
      <EmptyState
        variant="empty"
        title={t("admin.users.emptyTitle")}
        description={t("admin.users.emptyDescription")}
      />
    );
  } else {
    body = (
      <FlexColumn gap={GAP.normal}>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey="id"
          compact
          containerSx={{ overflowX: "auto" }}
        />
        <FlexRow justify="space-between" align="center">
          <Caption>
            {t("admin.users.range", {
              first: offset + 1,
              last: offset + shown,
              total
            })}
          </Caption>
          <FlexRow gap={GAP.tight}>
            <EditorButton
              variant="text"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              {t("admin.users.previous")}
            </EditorButton>
            <EditorButton
              variant="text"
              disabled={offset + shown >= total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              {t("admin.users.next")}
            </EditorButton>
          </FlexRow>
        </FlexRow>
      </FlexColumn>
    );
  }

  return (
    <FlexColumn gap={GAP.normal}>
      <FlexRow gap={GAP.normal} align="center" wrap>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <SearchInput
            value={query}
            onChange={handleSearch}
            placeholder={t("admin.users.searchPlaceholder")}
            ariaLabel={t("admin.users.searchPlaceholder")}
            debounceMs={250}
            fullWidth
          />
        </Box>
        <SelectField
          label={t("admin.users.filter.label")}
          value={status}
          onChange={handleStatus}
          options={statusOptions}
          size="small"
          hideLabel
        />
      </FlexRow>
      <FlexRow gap={GAP.normal} align="center" justify="space-between" wrap>
        <Caption>{defaultSummary}</Caption>
        <EditorButton
          variant="outlined"
          onClick={() => setQuotaTarget({ kind: "default" })}
        >
          {t("admin.quotas.editDefault")}
        </EditorButton>
      </FlexRow>
      <FlexRow gap={GAP.normal} align="center" justify="space-between" wrap>
        <Caption>
          {defaultBlocked === 0
            ? t("admin.permissions.defaultAll")
            : t("admin.permissions.defaultBlockedCount", {
                count: defaultBlocked
              })}
        </Caption>
        <EditorButton
          variant="outlined"
          onClick={() => setPermissionsTarget({ kind: "default" })}
        >
          {t("admin.permissions.editDefault")}
        </EditorButton>
      </FlexRow>
      {update.isError ? (
        <AlertBanner severity="error" compact>
          {update.error instanceof Error
            ? update.error.message
            : t("admin.users.updateFailed")}
        </AlertBanner>
      ) : null}
      {body}
      <QuotaDialog
        open={quotaTarget !== null}
        title={
          quotaTarget?.kind === "user"
            ? t("admin.quotas.userTitle", { name: userLabel(quotaTarget.user) })
            : t("admin.quotas.defaultTitle")
        }
        initial={quotaInitial}
        usesDefault={
          quotaTarget?.kind === "user" ? !quotaTarget.user.quota.custom : undefined
        }
        saving={quotaMutation.isPending}
        error={
          quotaMutation.isError
            ? (errorText(quotaMutation.error) ?? t("admin.quotas.saveFailed"))
            : null
        }
        onClose={closeQuota}
        onSave={saveQuota}
      />
      <PermissionsDialog
        open={permissionsTarget !== null}
        title={
          permissionsTarget?.kind === "user"
            ? t("admin.permissions.userTitle", {
                name: userLabel(permissionsTarget.user)
              })
            : t("admin.permissions.defaultTitle")
        }
        overrides={
          permissionsTarget?.kind === "user"
            ? permissionsTarget.user.permissions.overrides
            : (defaultPermissions.data?.overrides ?? EMPTY_OVERRIDES)
        }
        inherited={
          permissionsTarget?.kind === "user"
            ? (defaultPermissions.data?.flags ?? ALL_ALLOWED)
            : undefined
        }
        saving={setPermissions.isPending}
        error={
          setPermissions.isError
            ? (errorText(setPermissions.error) ?? t("admin.permissions.saveFailed"))
            : null
        }
        onClose={closePermissions}
        onSave={savePermissions}
      />
      <SharingDialog
        userId={sharingTarget?.user_id ?? null}
        title={
          sharingTarget
            ? t("admin.sharing.title", { name: userLabel(sharingTarget) })
            : ""
        }
        onClose={() => setSharingTarget(null)}
      />
      <ConfirmDialog
        open={pendingDisable !== null}
        onClose={() => setPendingDisable(null)}
        onConfirm={() => {
          if (pendingDisable) {
            applyChange({
              userId: pendingDisable.userId,
              status: pendingDisable.status
            });
          }
          setPendingDisable(null);
        }}
        title={t("admin.users.disableDialog.title", {
          name: pendingDisable?.label ?? ""
        })}
        content={t("admin.users.disableDialog.body")}
        confirmText={t("admin.users.actions.disable")}
        cancelText={t("admin.users.disableDialog.cancel")}
        destructive
      />
    </FlexColumn>
  );
};

export default memo(UsersAdmin);
