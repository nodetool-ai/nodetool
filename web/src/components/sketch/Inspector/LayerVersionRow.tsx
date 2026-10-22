/** @jsxImportSource @emotion/react */
/** One row in the generated-layer version history list. */

import React, { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import RestoreIcon from "@mui/icons-material/Restore";
import DeleteIcon from "@mui/icons-material/DeleteOutline";

import type { LayerVersion } from "@nodetool-ai/image-editor";
import {
  FlexRow,
  FlexColumn,
  Caption,
  Text,
  StatusIndicator,
  FavoriteButton,
  Dialog,
  ToolbarIconButton,
  HoverActionGroup
} from "../../ui_primitives";

const rowStyles = (theme: Theme) =>
  css({
    padding: `${theme.spacing(1)} ${theme.spacing(1)}`,
    borderRadius: theme.rounded.sm,
    cursor: "default",
    "&:hover": {
      backgroundColor: theme.vars.palette.action.hover
    }
  });

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatCost(credits: number): string {
  return `${credits.toFixed(2)} cr`;
}

function versionStatusType(
  status: LayerVersion["status"]
): "success" | "error" | "warning" {
  switch (status) {
    case "success":
      return "success";
    case "failed":
      return "error";
    case "cancelled":
      return "warning";
  }
}

interface LayerVersionRowProps {
  version: LayerVersion;
  onRestore: (versionId: string) => void;
  onSetFavorite: (versionId: string, favorite: boolean) => void;
  onDelete: (versionId: string) => void;
  isRestoring?: boolean;
  isFavoriting?: boolean;
  isDeleting?: boolean;
}

export const LayerVersionRow: React.FC<LayerVersionRowProps> = memo(
  ({
    version,
    onRestore,
    onSetFavorite,
    onDelete,
    isRestoring = false,
    isFavoriting = false,
    isDeleting = false
  }) => {
    const theme = useTheme();
    const { t } = useTranslation();
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

    const handleRestoreClick = useCallback(() => {
      onRestore(version.id);
    }, [onRestore, version.id]);

    const handleFavoriteToggle = useCallback(
      (isFavorite: boolean) => {
        onSetFavorite(version.id, isFavorite);
      },
      [onSetFavorite, version.id]
    );

    const handleDeleteClick = useCallback(() => {
      setDeleteDialogOpen(true);
    }, []);

    const handleDeleteConfirm = useCallback(() => {
      setDeleteDialogOpen(false);
      onDelete(version.id);
    }, [onDelete, version.id]);

    const handleDeleteCancel = useCallback(() => {
      setDeleteDialogOpen(false);
    }, []);

    const canRestore = version.status === "success";

    return (
      <>
        <FlexRow
          align="center"
          justify="space-between"
          fullWidth
          css={rowStyles(theme)}
        >
          <FlexColumn gap={0.5}>
            <Text size="small">{formatTimestamp(version.createdAt)}</Text>
            <FlexRow gap={1} align="center">
              <StatusIndicator
                status={versionStatusType(version.status)}
                label={t(`i18n-next52.sketch.statuses.${version.status}`)}
                size="small"
              />
              {version.costCredits !== undefined && (
                <Caption>{formatCost(version.costCredits)}</Caption>
              )}
            </FlexRow>
          </FlexColumn>

          <HoverActionGroup className="row-actions">
            <FavoriteButton
              isFavorite={version.favorite ?? false}
              onToggle={handleFavoriteToggle}
              variant="star"
              buttonSize="small"
              disabled={isFavoriting}
              addTooltip={t("i18n-next52.sketch.versions.favorite")}
              removeTooltip={t("i18n-next52.sketch.versions.unfavorite")}
            />
            {canRestore && (
              <ToolbarIconButton
                icon={<RestoreIcon fontSize="small" />}
                tooltip={t("i18n-next52.sketch.versions.restore")}
                onClick={handleRestoreClick}
                loading={isRestoring}
                aria-label={t("i18n-next52.sketch.versions.restoreLabel")}
              />
            )}
            <ToolbarIconButton
              icon={<DeleteIcon fontSize="small" />}
              tooltip={t("i18n-next52.sketch.versions.delete")}
              onClick={handleDeleteClick}
              loading={isDeleting}
              aria-label={t("i18n-next52.sketch.versions.deleteLabel")}
            />
          </HoverActionGroup>
        </FlexRow>

        <Dialog
          open={deleteDialogOpen}
          onClose={handleDeleteCancel}
          title={t("i18n-next52.sketch.versions.deleteTitle")}
          onConfirm={handleDeleteConfirm}
          confirmText={t("i18n-next52.sketch.versions.deleteConfirm")}
          destructive
        >
          <Text size="small">
            {t("i18n-next52.sketch.versions.deleteDescription")}
          </Text>
        </Dialog>
      </>
    );
  }
);

LayerVersionRow.displayName = "LayerVersionRow";

export default LayerVersionRow;
