/**
 * VersionListItem Component
 *
 * Displays a single version entry in the version history list.
 * Compact row layout (git-log style) with hover-reveal actions.
 */

import React, { useCallback } from "react";
import { IconButton } from "@mui/material";
import {
  Restore as RestoreIcon,
  Compare as CompareIcon
} from "@mui/icons-material";
import { Caption, Chip, DeleteButton, LoadingSpinner, Text, Tooltip } from "../ui_primitives";
import { SaveType } from "../../stores/VersionHistoryStore";
import { formatDistanceToNow, format } from "date-fns";
import { WorkflowVersion } from "../../stores/ApiTypes";
import { WorkflowMiniPreview } from "./WorkflowMiniPreview";

interface VersionListItemProps {
  version: WorkflowVersion & { save_type: SaveType; size_bytes: number; is_pinned?: boolean };
  isSelected: boolean;
  isCompareTarget: boolean;
  compareMode: boolean;
  onSelect: (versionId: string) => void;
  onRestore: (version: WorkflowVersion) => void;
  onDelete: (versionId: string) => void;
  onCompare: (versionId: string) => void;
  isRestoring?: boolean;
}

const getSaveTypeLabel = (saveType: SaveType): string => {
  switch (saveType) {
    case "manual":
      return "manual";
    case "autosave":
      return "auto";
    case "restore":
      return "restored";
    case "checkpoint":
      return "checkpoint";
    default:
      return saveType;
  }
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const VersionListItem = React.memo(function VersionListItem({
  version,
  isSelected,
  isCompareTarget,
  compareMode,
  onSelect,
  onRestore,
  onDelete,
  onCompare,
  isRestoring = false
}: VersionListItemProps) {
  const handleClick = useCallback(() => {
    if (compareMode) {
      onCompare(version.id);
    } else {
      onSelect(version.id);
    }
  }, [compareMode, version.id, onSelect, onCompare]);

  const handleRestore = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      onRestore(version);
    },
    [version, onRestore]
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      onDelete(version.id);
    },
    [version.id, onDelete]
  );

  const timeAgo = formatDistanceToNow(new Date(version.created_at), {
    addSuffix: true
  });

  const fullDate = format(new Date(version.created_at), "PPpp");

  return (
    <div
      onClick={handleClick}
      className="version-list-item"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "4px 8px",
        cursor: "pointer",
        borderLeft: isSelected
          ? "3px solid var(--palette-primary-main)"
          : isCompareTarget
            ? "3px dashed var(--palette-secondary-main)"
            : "3px solid transparent",
        backgroundColor: isSelected
          ? "rgba(var(--palette-primary-mainChannel) / 0.08)"
          : isCompareTarget
            ? "rgba(var(--palette-action-hoverChannel) / 0.04)"
            : "transparent",
        opacity: isRestoring ? 0.6 : 1,
        position: "relative"
      }}
      onMouseEnter={(e) => {
        if (!isSelected && !isCompareTarget) {
          e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.03)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected && !isCompareTarget) {
          e.currentTarget.style.backgroundColor = "transparent";
        }
      }}
    >
      {/* Mini preview thumbnail */}
      <div style={{ flexShrink: 0 }}>
        <WorkflowMiniPreview
          workflow={version}
          width={60}
          height={36}
        />
      </div>

      {/* Version info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <Text size="small" weight={600}>
            v{version.version}
          </Text>
          <Chip
            label={getSaveTypeLabel(version.save_type)}
            compact
            variant="outlined"
            size="small"
            sx={{
              height: "16px",
              fontSize: "0.6rem",
              opacity: 0.7,
              "& .MuiChip-label": { px: 0.5 }
            }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <Tooltip title={fullDate}>
            <span>
              <Caption size="tiny" color="muted">{timeAgo}</Caption>
            </span>
          </Tooltip>
          <Caption size="tiny" color="muted">
            {" · "}{formatBytes(version.size_bytes)}
          </Caption>
        </div>
        {version.description && (
          <Caption
            size="tiny"
            color="muted"
            sx={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 180,
              display: "block"
            }}
          >
            {version.description}
          </Caption>
        )}
      </div>

      {/* Actions - visible on hover via CSS */}
      <div
        className="version-item-actions"
        style={{
          display: "flex",
          gap: "2px",
          flexShrink: 0
        }}
      >
        {compareMode ? (
          <Tooltip title="Select for comparison">
            <IconButton size="small" onClick={handleClick} aria-label="Select for comparison" sx={{ padding: "2px" }}>
              <CompareIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        ) : isRestoring ? (
          <LoadingSpinner size="small" />
        ) : (
          <>
            <Tooltip title="Restore this version">
              <IconButton size="small" onClick={handleRestore} aria-label="Restore this version" sx={{ padding: "2px" }}>
                <RestoreIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
            <DeleteButton
              onClick={handleDelete}
              tooltip="Delete version"
              sx={{ padding: "2px", "& .MuiSvgIcon-root": { fontSize: 14 } }}
            />
          </>
        )}
      </div>

      {/* CSS for hover-reveal actions */}
      <style>{`
        .version-list-item .version-item-actions {
          opacity: 0;
          transition: opacity 0.15s ease;
        }
        .version-list-item:hover .version-item-actions {
          opacity: 1;
        }
      `}</style>
    </div>
  );
});

VersionListItem.displayName = "VersionListItem";

export { VersionListItem };
export default VersionListItem;
