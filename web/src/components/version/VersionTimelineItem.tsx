/**
 * Version Timeline Item Component
 *
 * Research Feature: Individual version entry in the timeline view.
 * Shows version info, metrics, and action buttons.
 *
 * Status: ⚠️ Experimental - This is a research feature. API may change.
 */

import React, { useState } from "react";
import {
  Box,
  Typography,
  Paper,
  IconButton,
  Button,
  Chip,
  Avatar,
  Tooltip,
  Collapse,
  TextField,
  InputAdornment,
  Divider,
  useTheme,
  alpha
} from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Restore as RestoreIcon,
  CallSplit as BranchIcon,
  Comment as CommentIcon,
  ContentCopy as CopyIcon,
  Delete as DeleteIcon,
  Check as CheckIcon
} from "@mui/icons-material";
import { SaveType } from "../../stores/VersionHistoryStore";

interface VersionTimelineItemProps {
  version: {
    id: string;
    version: number;
    created_at: string;
    name?: string;
    save_type?: SaveType;
  };
  metrics: {
    nodeCount: number;
    edgeCount: number;
    complexity: number;
    sizeBytes: number;
  };
  annotation?: string;
  branch?: string;
  isSelected: boolean;
  isCompareTarget: boolean;
  isCompareMode: boolean;
  isLatest: boolean;
  onSelect: () => void;
  onCompare: () => void;
  onRestore: () => void;
  onBranch: (branchName: string) => void;
  onAnnotate: (annotation: string) => void;
  _onDelete: () => void;
  isRestoring: boolean;
}

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) {return `${bytes} B`;}
  if (bytes < 1024 * 1024) {return `${(bytes / 1024).toFixed(1)} KB`;}
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatComplexity = (complexity: number): "Low" | "Medium" | "High" | "Very High" => {
  if (complexity < 10) {return "Low";}
  if (complexity < 30) {return "Medium";}
  if (complexity < 50) {return "High";}
  return "Very High";
};

export const VersionTimelineItem: React.FC<VersionTimelineItemProps> = ({
  version,
  metrics,
  annotation,
  branch,
  isSelected,
  isCompareTarget,
  isCompareMode,
  isLatest,
  onSelect,
  onCompare,
  onRestore,
  onBranch,
  onAnnotate,
  _onDelete,
  isRestoring
}) => {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [newAnnotation, setNewAnnotation] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [annotationMode, setAnnotationMode] = useState(false);

  const getSaveTypeColor = (): "primary" | "secondary" | "default" | "success" | "warning" | "error" => {
    switch (version.save_type) {
      case "manual": return "primary";
      case "autosave": return "secondary";
      case "checkpoint": return "success";
      case "restore": return "warning";
      default: return "default";
    }
  };

  const getComplexityColor = (): string => {
    if (metrics.complexity < 10) {return theme.palette.success.main;}
    if (metrics.complexity < 30) {return theme.palette.warning.main;}
    return theme.palette.error.main;
  };

  const handleToggleExpand = () => {
    setExpanded(!expanded);
  };

  const handleAddAnnotation = () => {
    if (newAnnotation.trim()) {
      onAnnotate(newAnnotation.trim());
      setNewAnnotation("");
      setAnnotationMode(false);
    }
  };

  const handleCreateBranch = () => {
    if (newBranchName.trim()) {
      onBranch(newBranchName.trim());
      setNewBranchName("");
    }
  };

  return (
    <Paper
      elevation={isSelected ? 3 : 1}
      sx={{
        mb: 2,
        border: isSelected ? 2 : 1,
        borderColor: isSelected ? "primary.main" : "divider",
        borderRadius: 2,
        overflow: "hidden",
        transition: "all 0.2s ease"
      }}
    >
      {/* Header */}
      <Box
        sx={{
          p: 2,
          cursor: "pointer",
          "&:hover": {
            bgcolor: alpha(theme.palette.primary.main, 0.05)
          }
        }}
        onClick={onSelect}
      >
        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}>
          {/* Timeline dot */}
          <Box sx={{ position: "relative" }}>
            <Avatar
              sx={{
                width: 40,
                height: 40,
                bgcolor: isLatest ? "primary.main" : "grey.400",
                fontSize: 14,
                fontWeight: 600,
                border: isSelected ? 3 : 0,
                borderColor: "primary.main"
              }}
            >
              {version.version}
            </Avatar>
            {/* Status indicator */}
            <Box
              sx={{
                position: "absolute",
                bottom: -2,
                right: -2,
                width: 12,
                height: 12,
                borderRadius: "50%",
                bgcolor: isLatest ? "success.main" : "grey.500",
                border: 2,
                borderColor: "background.paper"
              }}
            />
          </Box>

          {/* Version info */}
          <Box sx={{ flex: 1 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
              <Typography variant="subtitle1" fontWeight={isLatest ? 600 : 400}>
                Version {version.version}
              </Typography>
              <Chip
                label={version.save_type || "autosave"}
                size="small"
                color={getSaveTypeColor()}
                sx={{ height: 20, fontSize: "0.65rem" }}
              />
              {isLatest && (
                <Chip label="Latest" size="small" color="success" sx={{ height: 20, fontSize: "0.65rem" }} />
              )}
              {branch && (
                <Chip
                  icon={<BranchIcon />}
                  label={branch}
                  size="small"
                  variant="outlined"
                  sx={{ height: 20, fontSize: "0.65rem" }}
                />
              )}
              {isSelected && (
                <Chip label="Selected" size="small" color="primary" sx={{ height: 20, fontSize: "0.65rem" }} />
              )}
            </Box>

            <Typography variant="caption" color="text.secondary">
              {new Date(version.created_at).toLocaleString()}
              {version.name && ` • ${version.name}`}
            </Typography>

            {/* Quick metrics */}
            <Box sx={{ display: "flex", gap: 1, mt: 1, flexWrap: "wrap" }}>
              <Tooltip title="Node count">
                <Chip
                  label={`${metrics.nodeCount} nodes`}
                  size="small"
                  sx={{ height: 22, fontSize: "0.7rem" }}
                />
              </Tooltip>
              <Tooltip title="Connection count">
                <Chip
                  label={`${metrics.edgeCount} edges`}
                  size="small"
                  sx={{ height: 22, fontSize: "0.7rem" }}
                />
              </Tooltip>
              <Tooltip title="Complexity score">
                <Chip
                  label={formatComplexity(metrics.complexity)}
                  size="small"
                  sx={{
                    height: 22,
                    fontSize: "0.7rem",
                    bgcolor: alpha(getComplexityColor(), 0.2),
                    color: getComplexityColor(),
                    fontWeight: 500
                  }}
                />
              </Tooltip>
              <Tooltip title="Storage size">
                <Chip
                  label={formatBytes(metrics.sizeBytes)}
                  size="small"
                  sx={{ height: 22, fontSize: "0.7rem" }}
                />
              </Tooltip>
            </Box>

            {/* Annotation preview */}
            {annotation && (
              <Box
                sx={{
                  mt: 1,
                  p: 1,
                  bgcolor: alpha(theme.palette.info.main, 0.1),
                  borderRadius: 1,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 0.5
                }}
              >
                <CommentIcon fontSize="small" color="info" sx={{ mt: 0.25 }} />
                <Typography variant="caption" sx={{ fontStyle: "italic" }}>
                  &quot;{annotation}&quot;
                </Typography>
              </Box>
            )}
          </Box>

          {/* Actions */}
          <Box sx={{ display: "flex", gap: 0.5 }}>
            {isCompareMode && (
              <Button
                size="small"
                variant={isSelected || isCompareTarget ? "contained" : "outlined"}
                color={isSelected ? "primary" : isCompareTarget ? "secondary" : "inherit"}
                onClick={(e) => {
                  e.stopPropagation();
                  onCompare();
                }}
                sx={{ minWidth: "auto", px: 1.5 }}
              >
                {isSelected ? "Base" : isCompareTarget ? "Compare" : "Select"}
              </Button>
            )}
            <Tooltip title="View details">
              <IconButton size="small" onClick={(e) => {
                e.stopPropagation();
                handleToggleExpand();
              }}>
                {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </Box>

      {/* Expanded content */}
      <Collapse in={expanded}>
        <Divider />
        <Box sx={{ p: 2, bgcolor: alpha(theme.palette.background.default, 0.5) }}>
          {/* Action buttons */}
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
            <Button
              size="small"
              startIcon={<RestoreIcon />}
              onClick={onRestore}
              disabled={isRestoring || isLatest}
              variant="outlined"
            >
              Restore
            </Button>
            <Button
              size="small"
              startIcon={<BranchIcon />}
              onClick={() => setExpanded(true)}
              variant="outlined"
            >
              Branch
            </Button>
            <Button
              size="small"
              startIcon={<CommentIcon />}
              onClick={() => setAnnotationMode(!annotationMode)}
              variant="outlined"
            >
              Annotate
            </Button>
            <Button
              size="small"
              startIcon={<CopyIcon />}
              variant="outlined"
            >
              Duplicate
            </Button>
            <Button
              size="small"
              startIcon={<DeleteIcon />}
              color="error"
              variant="outlined"
            >
              Delete
            </Button>
          </Box>

          {/* Annotation input */}
          {annotationMode && (
            <Box sx={{ mb: 2 }}>
              <TextField
                size="small"
                fullWidth
                placeholder="Add a note to this version..."
                value={newAnnotation}
                onChange={(e) => setNewAnnotation(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === "Enter") {
                    handleAddAnnotation();
                  }
                }}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={handleAddAnnotation}>
                        <CheckIcon />
                      </IconButton>
                    </InputAdornment>
                  )
                }}
              />
            </Box>
          )}

          {/* Branch creation */}
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" gutterBottom>
              Create experiment branch from this version
            </Typography>
            <TextField
              size="small"
              fullWidth
              placeholder="Branch name (e.g., 'prompt-v2-test', 'ab-test-variant-a')"
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  handleCreateBranch();
                }
              }}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={handleCreateBranch}>
                      <BranchIcon />
                    </IconButton>
                  </InputAdornment>
                )
              }}
              sx={{ mt: 0.5 }}
            />
          </Box>

          <Divider sx={{ my: 2 }} />

          {/* Technical details */}
          <Box>
            <Typography variant="caption" color="text.secondary" fontWeight={500}>
              Technical Details
            </Typography>
            <Box sx={{ mt: 1, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 1 }}>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Version ID
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: "0.7rem" }}>
                  {version.id.substring(0, 8)}...
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Storage Size
                </Typography>
                <Typography variant="body2">
                  {formatBytes(metrics.sizeBytes)}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Created
                </Typography>
                <Typography variant="body2">
                  {new Date(version.created_at).toLocaleTimeString()}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Save Type
                </Typography>
                <Typography variant="body2">
                  {version.save_type || "unknown"}
                </Typography>
              </Box>
            </Box>
          </Box>
        </Box>
      </Collapse>
    </Paper>
  );
};

export default VersionTimelineItem;
