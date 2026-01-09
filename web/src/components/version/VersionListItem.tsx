/**
 * VersionListItem Component
 *
 * Displays a single version entry in the version history list.
 */

import React, { useCallback } from "react";
import {
  Box,
  Typography,
  IconButton,
  Chip,
  Tooltip,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  CircularProgress
} from "@mui/material";
import {
  Restore as RestoreIcon,
  Delete as DeleteIcon,
  PushPin as PinIcon,
  PushPinOutlined as PinOutlinedIcon,
  Compare as CompareIcon
} from "@mui/icons-material";
import { SaveType } from "../../stores/VersionHistoryStore";
import { formatDistanceToNow } from "date-fns";
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
  onPin: (versionId: string, pinned: boolean) => void;
  onCompare: (versionId: string) => void;
  isRestoring?: boolean;
  isDeleting?: boolean;
}

const getSaveTypeLabel = (saveType: SaveType): string => {
  switch (saveType) {
    case "manual":
      return "Manual";
    case "autosave":
      return "Autosave";
    case "restore":
      return "Restored";
    case "checkpoint":
      return "Checkpoint";
    default:
      return saveType;
  }
};

const getSaveTypeColor = (
  saveType: SaveType
): "primary" | "secondary" | "success" | "warning" | "info" | "error" => {
  switch (saveType) {
    case "manual":
      return "primary";
    case "autosave":
      return "secondary";
    case "restore":
      return "info";
    case "checkpoint":
      return "warning";
    default:
      return "primary";
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

export const VersionListItem: React.FC<VersionListItemProps> = ({
  version,
  isSelected,
  isCompareTarget,
  compareMode,
  onSelect,
  onRestore,
  onDelete,
  onPin,
  onCompare,
  isRestoring = false,
  isDeleting = false
}) => {
  const handleClick = useCallback(() => {
    if (compareMode) {
      onCompare(version.id);
    } else {
      onSelect(version.id);
    }
  }, [compareMode, version.id, onSelect, onCompare]);

  const handleRestore = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRestore(version);
    },
    [version, onRestore]
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDelete(version.id);
    },
    [version.id, onDelete]
  );

  const handlePin = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onPin(version.id, !version.is_pinned);
    },
    [version.id, version.is_pinned, onPin]
  );

  const timeAgo = formatDistanceToNow(new Date(version.created_at), {
    addSuffix: true
  });

  return (
    <ListItem
      onClick={handleClick}
      sx={{
        cursor: "pointer",
        borderLeft: isSelected
          ? "3px solid"
          : isCompareTarget
            ? "3px dashed"
            : "3px solid transparent",
        borderLeftColor: isSelected
          ? "primary.main"
          : isCompareTarget
            ? "secondary.main"
            : "transparent",
        bgcolor: isSelected
          ? "action.selected"
          : isCompareTarget
            ? "action.hover"
            : "transparent",
        "&:hover": {
          bgcolor: "action.hover"
        },
        mb: 0.5,
        borderRadius: 1,
        opacity: isRestoring ? 0.6 : 1
      }}
    >
      <Box sx={{ mr: 1, flexShrink: 0 }}>
        <WorkflowMiniPreview
          workflow={version}
          width={80}
          height={50}
        />
      </Box>
      <ListItemText
        primary={
          <Box display="flex" alignItems="center" gap={1}>
            <Typography variant="body2" fontWeight="medium">
              v{version.version}
            </Typography>
            <Chip
              label={getSaveTypeLabel(version.save_type)}
              size="small"
              color={getSaveTypeColor(version.save_type)}
              sx={{ height: 20, fontSize: "0.7rem" }}
            />
            {version.is_pinned && (
              <PinIcon fontSize="small" color="primary" sx={{ fontSize: 14 }} />
            )}
          </Box>
        }
        secondary={
          <Box>
            <Typography variant="caption" color="text.secondary">
              {timeAgo} • {formatBytes(version.size_bytes)}
            </Typography>
            {version.description && (
              <Typography
                variant="caption"
                display="block"
                color="text.secondary"
                sx={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: 180
                }}
              >
                {version.description}
              </Typography>
            )}
          </Box>
        }
      />
      <ListItemSecondaryAction>
        <Box sx={{ display: "flex", gap: 0.5 }}>
          {compareMode ? (
            <Tooltip title="Select for comparison">
              <IconButton size="small" onClick={handleClick}>
                <CompareIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : isRestoring || isDeleting ? (
            <CircularProgress size={20} />
          ) : (
            <>
              <Tooltip title="Restore this version">
                <IconButton size="small" onClick={handleRestore}>
                  <RestoreIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={version.is_pinned ? "Unpin" : "Pin"}>
                <IconButton size="small" onClick={handlePin}>
                  {version.is_pinned ? (
                    <PinIcon fontSize="small" />
                  ) : (
                    <PinOutlinedIcon fontSize="small" />
                  )}
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete version">
                <IconButton size="small" onClick={handleDelete}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          )}
        </Box>
      </ListItemSecondaryAction>
    </ListItem>
  );
};
