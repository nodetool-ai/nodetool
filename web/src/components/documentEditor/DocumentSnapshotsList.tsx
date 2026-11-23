/**
 * Scrollable Snapshot List with right-click context menu and built-in Rename,
 * confirmed Restore, and confirmed Delete dialogs (document editor PRD R11,
 * R31).
 */
import { useCallback, useMemo, useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import RestoreIcon from "@mui/icons-material/Restore";

import { relativeTime } from "../../utils/formatDateAndTime";
import ErrorBanner from "../support/ErrorBanner";
import {
  AlertBanner,
  Caption,
  Chip,
  ContextMenu,
  Dialog,
  EmptyState,
  FlexColumn,
  FlexRow,
  GAP,
  LoadingSpinner,
  MenuItemPrimitive,
  PADDING,
  PanelHeader,
  ScrollArea,
  SelectableListItem,
  Text,
  TextInput
} from "../ui_primitives";

export interface SnapshotVersionSummary {
  version: number;
  name: string | null;
  save_type: string;
  created_at: string;
}

export interface DocumentSnapshotsListProps {
  versions: SnapshotVersionSummary[];
  selectedVersion: number | null;
  isLoading: boolean;
  error: unknown;
  onSelect: (version: number) => void;
  onRename: (version: number, name: string | null) => Promise<void>;
  onRestore: (version: number) => Promise<void>;
  onDelete: (version: number) => Promise<void>;
  isMutating?: boolean;
}

interface ContextMenuState {
  version: SnapshotVersionSummary;
  position: { x: number; y: number };
}

type ActiveDialog =
  | { kind: "rename"; item: SnapshotVersionSummary }
  | { kind: "restore"; item: SnapshotVersionSummary }
  | { kind: "delete"; item: SnapshotVersionSummary };

export const DocumentSnapshotsList = ({
  versions,
  selectedVersion,
  isLoading,
  error,
  onSelect,
  onRename,
  onRestore,
  onDelete,
  isMutating = false
}: DocumentSnapshotsListProps) => {
  const { t } = useTranslation();
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [dialog, setDialog] = useState<ActiveDialog | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const sortedVersions = useMemo(
    () => [...versions].sort((a, b) => b.version - a.version),
    [versions]
  );

  const labelOf = useCallback(
    (item: SnapshotVersionSummary): string =>
      item.name ||
      t("documentEditor.versions.versionNumber", {
        version: item.version,
        defaultValue: "Version {{version}}"
      }),
    [t]
  );

  const handleContextMenu = (
    event: MouseEvent<HTMLDivElement>,
    item: SnapshotVersionSummary
  ) => {
    event.preventDefault();
    setMenu({
      version: item,
      position: { x: event.clientX, y: event.clientY }
    });
  };

  const closeDialog = useCallback(() => {
    if (submitting) {
      return;
    }
    setDialog(null);
    setDialogError(null);
  }, [submitting]);

  const openRename = (item: SnapshotVersionSummary) => {
    setMenu(null);
    setRenameDraft(item.name ?? "");
    setDialogError(null);
    setDialog({ kind: "rename", item });
  };

  const openRestore = (item: SnapshotVersionSummary) => {
    setMenu(null);
    setDialogError(null);
    setDialog({ kind: "restore", item });
  };

  const openDelete = (item: SnapshotVersionSummary) => {
    setMenu(null);
    setDialogError(null);
    setDialog({ kind: "delete", item });
  };

  const busy = submitting || isMutating;

  const confirmRename = useCallback(async () => {
    if (!dialog || dialog.kind !== "rename" || busy) {
      return;
    }
    setSubmitting(true);
    setDialogError(null);
    try {
      const nextName = renameDraft.trim() ? renameDraft.trim() : null;
      await onRename(dialog.item.version, nextName);
      setDialog(null);
    } catch (cause) {
      setDialogError(
        cause instanceof Error
          ? cause.message
          : t("documentEditor.snapshots.renameError", "Could not rename the snapshot.")
      );
    } finally {
      setSubmitting(false);
    }
  }, [busy, dialog, onRename, renameDraft, t]);

  const confirmRestore = useCallback(async () => {
    if (!dialog || dialog.kind !== "restore" || busy) {
      return;
    }
    setSubmitting(true);
    setDialogError(null);
    try {
      await onRestore(dialog.item.version);
      setDialog(null);
    } catch (cause) {
      setDialogError(
        cause instanceof Error
          ? cause.message
          : t("documentEditor.snapshots.restoreError", "Could not restore the snapshot.")
      );
    } finally {
      setSubmitting(false);
    }
  }, [busy, dialog, onRestore, t]);

  const confirmDelete = useCallback(async () => {
    if (!dialog || dialog.kind !== "delete" || busy) {
      return;
    }
    setSubmitting(true);
    setDialogError(null);
    try {
      await onDelete(dialog.item.version);
      setDialog(null);
    } catch (cause) {
      setDialogError(
        cause instanceof Error
          ? cause.message
          : t("documentEditor.snapshots.deleteError", "Could not delete the snapshot.")
      );
    } finally {
      setSubmitting(false);
    }
  }, [busy, dialog, onDelete, t]);

  return (
    <FlexColumn fullWidth sx={{ flex: 1, minHeight: 0 }}>
      <PanelHeader
        title={t("documentEditor.snapshots.listTitle", "Snapshots")}
        count={sortedVersions.length > 0 ? sortedVersions.length : undefined}
      />
      {error ? (
        <ErrorBanner
          report={{
            source: "operation-failure",
            summary: "Document snapshots failed to load",
            errorText: String(error)
          }}
        >
          {t(
            "documentEditor.versions.loadError",
            "Versions could not be loaded."
          )}
        </ErrorBanner>
      ) : null}
      <ScrollArea
        thin
        sx={{
          flex: 1,
          minHeight: 0,
          paddingX: PADDING.compact,
          paddingY: PADDING.compact
        }}
      >
        {isLoading ? (
          <FlexRow justify="center" sx={{ padding: PADDING.comfortable }}>
            <LoadingSpinner size="small" />
          </FlexRow>
        ) : sortedVersions.length === 0 ? (
          <EmptyState
            size="small"
            title={t(
              "documentEditor.snapshots.emptyTitle",
              "No snapshots yet"
            )}
            description={t(
              "documentEditor.snapshots.emptyBody",
              "Take a snapshot before major edits to compare or restore later."
            )}
          />
        ) : (
          <FlexColumn gap={GAP.tight}>
            {sortedVersions.map((item) => {
              const selected = selectedVersion === item.version;
              return (
                <SelectableListItem
                  key={item.version}
                  selected={selected}
                  onClick={() => onSelect(item.version)}
                  onContextMenu={(event) => handleContextMenu(event, item)}
                  sx={{ flexDirection: "column", alignItems: "flex-start" }}
                >
                  <FlexRow gap={GAP.tight} align="center">
                    <Text size="small" weight={500}>
                      {labelOf(item)}
                    </Text>
                    <Chip
                      compact
                      size="small"
                      label={t(
                        `documentEditor.versions.saveTypes.${item.save_type}`,
                        item.save_type
                      )}
                    />
                  </FlexRow>
                  <Caption color="secondary">
                    {relativeTime(item.created_at)}
                  </Caption>
                </SelectableListItem>
              );
            })}
          </FlexColumn>
        )}
      </ScrollArea>

      <ContextMenu
        open={menu !== null}
        position={menu?.position ?? null}
        onClose={() => setMenu(null)}
      >
        <MenuItemPrimitive
          icon={<EditOutlinedIcon fontSize="small" />}
          label={t("documentEditor.snapshots.rename", "Rename")}
          disabled={busy}
          onClick={() => {
            if (menu) {
              openRename(menu.version);
            }
          }}
        />
        <MenuItemPrimitive
          icon={<RestoreIcon fontSize="small" />}
          label={t("documentEditor.snapshots.restore", "Restore")}
          disabled={busy}
          onClick={() => {
            if (menu) {
              openRestore(menu.version);
            }
          }}
        />
        <MenuItemPrimitive
          icon={<DeleteOutlineIcon fontSize="small" />}
          color="error"
          dividerBefore
          label={t("documentEditor.snapshots.delete", "Delete")}
          disabled={busy}
          onClick={() => {
            if (menu) {
              openDelete(menu.version);
            }
          }}
        />
      </ContextMenu>

      <Dialog
        open={dialog?.kind === "rename"}
        onClose={closeDialog}
        title={t("documentEditor.snapshots.renameTitle", "Rename snapshot")}
        onConfirm={() => void confirmRename()}
        confirmText={t("common.save", "Save")}
        cancelText={t("common.cancel", "Cancel")}
        isLoading={busy}
      >
        <FlexColumn gap={GAP.normal}>
          <TextInput
            autoFocus
            value={renameDraft}
            onChange={(event) => setRenameDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void confirmRename();
              }
            }}
            label={t("documentEditor.snapshots.nameLabel", "Snapshot name")}
            placeholder={t(
              "documentEditor.versions.namePlaceholder",
              "Name (optional)"
            )}
            disabled={busy}
          />
          {dialogError && (
            <AlertBanner severity="error">{dialogError}</AlertBanner>
          )}
        </FlexColumn>
      </Dialog>

      <Dialog
        open={dialog?.kind === "restore"}
        onClose={closeDialog}
        title={t("documentEditor.snapshots.restoreTitle", "Restore snapshot")}
        onConfirm={() => void confirmRestore()}
        confirmText={t("documentEditor.snapshots.restore", "Restore")}
        cancelText={t("common.cancel", "Cancel")}
        isLoading={busy}
      >
        <FlexColumn gap={GAP.normal}>
          <Text size="small">
            {t("documentEditor.snapshots.restoreConfirmBody", {
              name: dialog ? labelOf(dialog.item) : "",
              defaultValue:
                "Restore {{name}} as the current document? Your current text and every prior snapshot remain in history."
            })}
          </Text>
          {dialogError && (
            <AlertBanner severity="error">{dialogError}</AlertBanner>
          )}
        </FlexColumn>
      </Dialog>

      <Dialog
        open={dialog?.kind === "delete"}
        onClose={closeDialog}
        title={t("documentEditor.snapshots.deleteTitle", "Delete snapshot")}
        onConfirm={() => void confirmDelete()}
        confirmText={t("documentEditor.snapshots.delete", "Delete")}
        cancelText={t("common.cancel", "Cancel")}
        destructive
        isLoading={busy}
      >
        <FlexColumn gap={GAP.normal}>
          <Text size="small">
            {t("documentEditor.snapshots.deleteConfirmBody", {
              name: dialog ? labelOf(dialog.item) : "",
              defaultValue:
                "Permanently delete {{name}}? This cannot be undone."
            })}
          </Text>
          {dialogError && (
            <AlertBanner severity="error">{dialogError}</AlertBanner>
          )}
        </FlexColumn>
      </Dialog>
    </FlexColumn>
  );
};

export default DocumentSnapshotsList;
