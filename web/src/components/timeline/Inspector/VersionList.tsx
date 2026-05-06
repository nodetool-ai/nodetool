/** @jsxImportSource @emotion/react */
/**
 * VersionList
 *
 * Collapsible section showing the version history for a single timeline clip.
 * Collapsed by default; header shows "Versions (N)".
 *
 * - Restore: calls `useTimelineStore.restoreVersion` (purely local, autosave
 *   persists it on next cycle).
 * - Favorite: calls `trpc.timeline.versions.setFavorite` (prevents pruning).
 * - Delete: calls `trpc.timeline.versions.delete` with a confirmation dialog.
 *
 * Versions are displayed newest-first.
 */

import React, { memo, useCallback, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";

import {
  FlexColumn,
  FlexRow,
  Text,
  LoadingSpinner,
  EmptyState,
  ToolbarIconButton
} from "../../ui_primitives";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import {
  useClipVersions,
  useSetClipVersionFavorite,
  useDeleteClipVersion
} from "../../../hooks/timeline/useClipVersions";
import { VersionRow } from "./VersionRow";

// ── Styles ──────────────────────────────────────────────────────────────────

const sectionStyles = (theme: Theme) =>
  css({
    borderTop: `1px solid ${theme.vars.palette.divider}`,
    paddingTop: theme.spacing(0.5)
  });

const headerStyles = (theme: Theme) =>
  css({
    padding: `${theme.spacing(0.5)} ${theme.spacing(1)}`,
    cursor: "pointer",
    borderRadius: theme.rounded.sm,
    userSelect: "none",
    "&:hover": {
      backgroundColor: theme.vars.palette.action.hover
    }
  });

// ── Props ───────────────────────────────────────────────────────────────────

export interface VersionListProps {
  sequenceId: string;
  clipId: string;
}

// ── Component ───────────────────────────────────────────────────────────────

export const VersionList: React.FC<VersionListProps> = memo(
  ({ sequenceId, clipId }) => {
    const theme = useTheme();
    const [expanded, setExpanded] = useState(false);

    const { data: versions, isLoading, error } = useClipVersions(
      expanded ? sequenceId : null,
      expanded ? clipId : null
    );

    const setFavoriteMutation = useSetClipVersionFavorite();
    const deleteMutation = useDeleteClipVersion();
    const restoreVersion = useTimelineStore((s) => s.restoreVersion);

    const toggleExpanded = useCallback(() => {
      setExpanded((v) => !v);
    }, []);

    const handleRestore = useCallback(
      (versionId: string) => {
        restoreVersion(clipId, versionId);
      },
      [restoreVersion, clipId]
    );

    const handleSetFavorite = useCallback(
      (versionId: string, favorite: boolean) => {
        setFavoriteMutation.mutate({
          id: sequenceId,
          clipId,
          versionId,
          favorite
        });
      },
      [setFavoriteMutation, sequenceId, clipId]
    );

    const handleDelete = useCallback(
      (versionId: string) => {
        deleteMutation.mutate({ id: sequenceId, clipId, versionId });
      },
      [deleteMutation, sequenceId, clipId]
    );

    // Versions displayed newest-first
    const sorted = versions ? [...versions].reverse() : [];
    const count = sorted.length;

    return (
      <FlexColumn gap={0} css={sectionStyles(theme)}>
        {/* Section header */}
        <FlexRow
          align="center"
          justify="space-between"
          fullWidth
          css={headerStyles(theme)}
          onClick={toggleExpanded}
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") toggleExpanded();
          }}
        >
          <Text size="small" weight={500}>
            {expanded && count > 0 ? `Versions (${count})` : "Versions"}
          </Text>
          <ToolbarIconButton
            icon={expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            tooltip={expanded ? "Collapse versions" : "Expand versions"}
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              toggleExpanded();
            }}
            aria-label={expanded ? "Collapse versions" : "Expand versions"}
          />
        </FlexRow>

        {/* Body */}
        {expanded && (
          <FlexColumn gap={0} sx={{ pb: 1 }}>
            {isLoading && (
              <FlexRow justify="center" sx={{ py: 2 }}>
                <LoadingSpinner size="small" />
              </FlexRow>
            )}

            {error && (
              <EmptyState
                variant="error"
                size="small"
                title="Failed to load versions"
              />
            )}

            {!isLoading && !error && sorted.length === 0 && (
              <EmptyState
                variant="empty"
                size="small"
                title="No versions yet"
                description="Successful generations will appear here"
              />
            )}

            {!isLoading &&
              !error &&
              sorted.map((version) => (
                <VersionRow
                  key={version.id}
                  version={version}
                  onRestore={handleRestore}
                  onSetFavorite={handleSetFavorite}
                  onDelete={handleDelete}
                  isFavoriting={
                    setFavoriteMutation.isPending &&
                    setFavoriteMutation.variables?.versionId === version.id
                  }
                  isDeleting={
                    deleteMutation.isPending &&
                    deleteMutation.variables?.versionId === version.id
                  }
                />
              ))}
          </FlexColumn>
        )}
      </FlexColumn>
    );
  }
);

VersionList.displayName = "VersionList";

export default VersionList;
