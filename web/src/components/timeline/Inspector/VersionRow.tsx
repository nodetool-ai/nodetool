/** @jsxImportSource @emotion/react */
/**
 * VersionRow
 *
 * A single row in the clip version history list.
 * Shows: timestamp, status pill, cost (if known), and action buttons
 * (Favorite toggle, Delete with confirmation).
 *
 * Restore is triggered via the primary "Restore" action.
 */

import React, { memo, useCallback, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import RestoreIcon from "@mui/icons-material/Restore";
import DeleteIcon from "@mui/icons-material/Delete";

import type { ClipVersion } from "@nodetool-ai/timeline";
import {
  FlexRow,
  FlexColumn,
  Caption,
  Text,
  StatusIndicator,
  FavoriteButton,
  Dialog,
  ToolbarIconButton
} from "../../ui_primitives";

// ── Styles ──────────────────────────────────────────────────────────────────

const rowStyles = (theme: Theme) =>
  css({
    padding: `${theme.spacing(0.75)} ${theme.spacing(1)}`,
    borderRadius: theme.rounded.sm,
    cursor: "default",
    "&:hover": {
      backgroundColor: theme.vars.palette.action.hover
    },
    "&:hover .row-actions": {
      opacity: 1
    },
    ".row-actions": {
      opacity: 0,
      transition: "opacity 0.15s"
    }
  });

// ── Helpers ──────────────────────────────────────────────────────────────────

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
  status: ClipVersion["status"]
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

// ── Props ───────────────────────────────────────────────────────────────────

export interface VersionRowProps {
  version: ClipVersion;
  onRestore: (versionId: string) => void;
  onSetFavorite: (versionId: string, favorite: boolean) => void;
  onDelete: (versionId: string) => void;
  isRestoring?: boolean;
  isFavoriting?: boolean;
  isDeleting?: boolean;
}

// ── Component ───────────────────────────────────────────────────────────────

export const VersionRow: React.FC<VersionRowProps> = memo(
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
          {/* Left: timestamp + status */}
          <FlexColumn gap={0.25}>
            <Text size="small">{formatTimestamp(version.createdAt)}</Text>
            <FlexRow gap={1} align="center">
              <StatusIndicator
                status={versionStatusType(version.status)}
                label={version.status}
                size="small"
              />
              {version.costCredits !== undefined && (
                <Caption>{formatCost(version.costCredits)}</Caption>
              )}
            </FlexRow>
          </FlexColumn>

          {/* Right: action buttons (shown on hover) */}
          <FlexRow gap={0.25} align="center" className="row-actions">
            <FavoriteButton
              isFavorite={version.favorite ?? false}
              onToggle={handleFavoriteToggle}
              variant="star"
              buttonSize="small"
              disabled={isFavoriting}
              addTooltip="Mark as favorite (prevents pruning)"
              removeTooltip="Remove from favorites"
            />
            {canRestore && (
              <ToolbarIconButton
                icon={<RestoreIcon fontSize="small" />}
                tooltip="Restore this version"
                onClick={handleRestoreClick}
                disabled={isRestoring}
                aria-label="Restore version"
              />
            )}
            <ToolbarIconButton
              icon={<DeleteIcon fontSize="small" />}
              tooltip="Delete version"
              onClick={handleDeleteClick}
              disabled={isDeleting}
              aria-label="Delete version"
            />
          </FlexRow>
        </FlexRow>

        {/* Delete confirmation dialog */}
        <Dialog
          open={deleteDialogOpen}
          onClose={handleDeleteCancel}
          title="Delete version?"
          onConfirm={handleDeleteConfirm}
          confirmText="Delete"
          cancelText="Cancel"
          destructive
        >
          This version will be permanently removed. The underlying job and asset
          are not deleted.
        </Dialog>
      </>
    );
  }
);

VersionRow.displayName = "VersionRow";

export default VersionRow;
