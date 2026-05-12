/** @jsxImportSource @emotion/react */
/** Collapsible version history list for a single generated layer. */

import React, { memo, useCallback, useMemo, useState } from "react";
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
import { useSketchSessionStore } from "../../../stores/sketch/SketchSessionStore";
import {
  useLayerVersions,
  useSetLayerVersionFavorite,
  useDeleteLayerVersion
} from "../../../hooks/sketch/useLayerVersions";
import { LayerVersionRow } from "./LayerVersionRow";

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

export interface LayerVersionListProps {
  documentId: string;
  layerId: string;
}

export const LayerVersionList: React.FC<LayerVersionListProps> = memo(
  ({ documentId, layerId }) => {
    const theme = useTheme();
    const [expanded, setExpanded] = useState(false);

    const { data: versions, isLoading, error } = useLayerVersions(
      expanded ? documentId : null,
      expanded ? layerId : null
    );

    const setFavoriteMutation = useSetLayerVersionFavorite();
    const deleteMutation = useDeleteLayerVersion();
    const restoreVersion = useSketchSessionStore((s) => s.restoreVersion);

    const toggleExpanded = useCallback(() => {
      setExpanded((v) => !v);
    }, []);

    const handleRestore = useCallback(
      (versionId: string) => {
        restoreVersion(layerId, versionId);
      },
      [restoreVersion, layerId]
    );

    const handleSetFavorite = useCallback(
      (versionId: string, favorite: boolean) => {
        setFavoriteMutation.mutate({
          id: documentId,
          layerId,
          versionId,
          favorite
        });
      },
      [setFavoriteMutation, documentId, layerId]
    );

    const handleDelete = useCallback(
      (versionId: string) => {
        deleteMutation.mutate({ id: documentId, layerId, versionId });
      },
      [deleteMutation, documentId, layerId]
    );

    const sorted = useMemo(
      () => (versions ? [...versions].reverse() : []),
      [versions]
    );
    const count = sorted.length;

    return (
      <FlexColumn gap={0} css={sectionStyles(theme)}>
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
                <LayerVersionRow
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

LayerVersionList.displayName = "LayerVersionList";

export default LayerVersionList;
