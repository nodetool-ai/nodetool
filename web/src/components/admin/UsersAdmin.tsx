import React, { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useAdminUsers,
  useUpdateAdminUser,
  type AdminUser,
  type AdminUserChange,
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

const PAGE_SIZE = 50;

type StatusFilter = AdminUserStatus | "all";

interface PendingChange extends AdminUserChange {
  label: string;
}

const userLabel = (user: AdminUser): string =>
  user.display_name ?? user.email ?? user.user_id;

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

  const users = useAdminUsers({ query, status, offset, limit: PAGE_SIZE });
  const update = useUpdateAdminUser();

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
            </FlexColumn>
          ),
          status: (
            <StatusPill tone={user.status === "active" ? "done" : "failed"}>
              {user.status === "active"
                ? t("admin.users.status.active")
                : t("admin.users.status.disabled")}
            </StatusPill>
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
    [users.data, update.isPending, update.variables, applyChange, t]
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
      {update.isError ? (
        <AlertBanner severity="error" compact>
          {update.error instanceof Error
            ? update.error.message
            : t("admin.users.updateFailed")}
        </AlertBanner>
      ) : null}
      {body}
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
