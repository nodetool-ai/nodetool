/**
 * VersionTimeline Component
 *
 * Visual timeline display of workflow versions with checkpoint management.
 * Shows versions chronologically with visual indicators for save types,
 * allowing users to browse, compare, and restore versions easily.
 */

import React, { useCallback, useMemo, useState } from "react";
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Chip,
  Avatar,
  Divider,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  useTheme,
  alpha
} from "@mui/material";
import {
  History as HistoryIcon,
  Download as DownloadIcon,
  Restore as RestoreIcon,
  Compare as CompareIcon,
  MoreVert as MoreVertIcon,
  Bookmark as BookmarkIcon,
  Delete as DeleteIcon,
  Flag as FlagIcon,
  AutoAwesome as AutoAwesomeIcon,
  Save as SaveIcon,
  Schedule as ScheduleIcon
} from "@mui/icons-material";
import { DateTime } from "luxon";
import { relativeTime } from "../../utils/formatDateAndTime";
import { GraphVisualDiff } from "./GraphVisualDiff";
import { VersionDiff } from "./VersionDiff";
import { useVersionHistoryStore, SaveType } from "../../stores/VersionHistoryStore";
import { useWorkflowVersions } from "../../serverState/useWorkflowVersions";
import { computeGraphDiff, GraphDiff } from "../../utils/graphDiff";
import { WorkflowVersion, Graph } from "../../stores/ApiTypes";

interface VersionTimelineProps {
  workflowId: string;
  onRestore: (version: WorkflowVersion) => void;
  onClose: () => void;
}

interface TimelineVersion {
  version: WorkflowVersion & { save_type: SaveType };
  position: number;
}

const getSaveTypeIcon = (saveType: SaveType) => {
  switch (saveType) {
    case "manual":
      return <SaveIcon fontSize="small" />;
    case "checkpoint":
      return <BookmarkIcon fontSize="small" />;
    case "autosave":
      return <AutoAwesomeIcon fontSize="small" />;
    case "restore":
      return <RestoreIcon fontSize="small" />;
    default:
      return <ScheduleIcon fontSize="small" />;
  }
};

const getSaveTypeColor = (saveType: SaveType, themePalette: { primary: { main: string }; warning: { main: string }; info: { main: string }; success: { main: string }; grey: { 500: string } }): string => {
  switch (saveType) {
    case "manual":
      return themePalette.primary.main;
    case "checkpoint":
      return themePalette.warning.main;
    case "autosave":
      return themePalette.info.main;
    case "restore":
      return themePalette.success.main;
    default:
      return themePalette.grey[500];
  }
};

const getSaveTypeLabel = (saveType: SaveType): string => {
  switch (saveType) {
    case "manual":
      return "Manual Save";
    case "checkpoint":
      return "Checkpoint";
    case "autosave":
      return "Auto-save";
    case "restore":
      return "Restored";
    default:
      return "Save";
  }
};

const getSaveType = (version: WorkflowVersion): SaveType => {
  if (version.save_type && ["manual", "autosave", "checkpoint", "restore"].includes(version.save_type)) {
    return version.save_type;
  }
  if (!version.name) {
    return "autosave";
  }
  const lower = version.name.toLowerCase();
  if (lower.includes("manual")) {
    return "manual";
  }
  if (lower.includes("checkpoint")) {
    return "checkpoint";
  }
  if (lower.includes("restore")) {
    return "restore";
  }
  return "autosave";
};

export const VersionTimeline: React.FC<VersionTimelineProps> = ({
  workflowId,
  onRestore,
  onClose
}) => {
  const theme = useTheme();
  const {
    selectedVersionId,
    compareVersionId,
    isCompareMode,
    setSelectedVersion,
    setCompareVersion,
    setCompareMode,
    setHistoryPanelOpen
  } = useVersionHistoryStore();

  const {
    data: apiVersions,
    isLoading,
    error,
    restoreVersion,
    isRestoringVersion,
    createVersion
  } = useWorkflowVersions(workflowId);

  const [filterType, setFilterType] = useState<SaveType | "all">("all");
  const [expandedVersionId, setExpandedVersionId] = useState<string | null>(null);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [menuVersionId, setMenuVersionId] = useState<string | null>(null);
  const [checkpointDialogOpen, setCheckpointDialogOpen] = useState(false);
  const [checkpointName, setCheckpointName] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [versionToDelete, setVersionToDelete] = useState<string | null>(null);

  const versions: Array<TimelineVersion> = useMemo(() => {
    if (!apiVersions?.versions) {
      return [];
    }
    let filtered = apiVersions.versions;
    if (filterType !== "all") {
      filtered = filtered.filter((v) => getSaveType(v) === filterType);
    }
    const sorted = [...filtered].sort((a, b) => b.version - a.version);
    return sorted.map((v, index) => ({
      version: {
        ...v,
        save_type: getSaveType(v)
      },
      position: index
    }));
  }, [apiVersions, filterType]);

  const selectedVersion = useMemo(
    () => versions.find((v) => v.version.id === selectedVersionId)?.version,
    [versions, selectedVersionId]
  );

  const compareVersion = useMemo(
    () => versions.find((v) => v.version.id === compareVersionId)?.version,
    [versions, compareVersionId]
  );

  const diff: GraphDiff | null = useMemo(() => {
    if (!selectedVersion || !compareVersion) {
      return null;
    }
    const [older, newer] =
      selectedVersion.version < compareVersion.version
        ? [selectedVersion, compareVersion]
        : [compareVersion, selectedVersion];

    return computeGraphDiff(
      older.graph as unknown as Graph,
      newer.graph as unknown as Graph
    );
  }, [selectedVersion, compareVersion]);

  const handleSelect = useCallback(
    (versionId: string) => {
      if (isCompareMode) {
        if (!selectedVersionId) {
          setSelectedVersion(versionId);
        } else if (selectedVersionId === versionId) {
          setSelectedVersion(null);
        } else {
          setCompareVersion(versionId);
        }
      } else {
        setSelectedVersion(
          selectedVersionId === versionId ? null : versionId
        );
      }
    },
    [selectedVersionId, isCompareMode, setSelectedVersion, setCompareVersion]
  );

  const handleMenuOpen = useCallback((event: React.MouseEvent<HTMLElement>, versionId: string) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
    setMenuVersionId(versionId);
  }, []);

  const handleMenuClose = useCallback(() => {
    setAnchorEl(null);
    setMenuVersionId(null);
  }, []);

  const handleCreateCheckpoint = useCallback(async () => {
    if (!checkpointName.trim() || !menuVersionId) {
      return;
    }
    try {
      await createVersion({
        name: checkpointName,
        description: `Checkpoint: ${checkpointName}`
      });
      setCheckpointDialogOpen(false);
      setCheckpointName("");
      handleMenuClose();
    } catch (error) {
      console.error("Failed to create checkpoint:", error);
    }
  }, [checkpointName, menuVersionId, createVersion, handleMenuClose]);

  const handleExportVersion = useCallback((version: WorkflowVersion) => {
    const blob = new Blob([JSON.stringify(version, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `workflow-version-${version.version}.json`;
    a.click();
    URL.revokeObjectURL(url);
    handleMenuClose();
  }, [handleMenuClose]);

  const handleRestore = useCallback(
    async (version: WorkflowVersion) => {
      try {
        await restoreVersion(version.version);
        onRestore(version);
        setHistoryPanelOpen(false);
      } catch (error) {
        console.error("Failed to restore version:", error);
      }
    },
    [restoreVersion, onRestore, setHistoryPanelOpen]
  );

  const handleDelete = useCallback((versionId: string) => {
    setVersionToDelete(versionId);
    setDeleteDialogOpen(true);
    handleMenuClose();
  }, [handleMenuClose]);

  const handleConfirmDelete = useCallback(() => {
    if (versionToDelete) {
      if (selectedVersionId === versionToDelete) {
        setSelectedVersion(null);
      }
      if (compareVersionId === versionToDelete) {
        setCompareVersion(null);
      }
    }
    setDeleteDialogOpen(false);
    setVersionToDelete(null);
  }, [versionToDelete, selectedVersionId, compareVersionId, setSelectedVersion, setCompareVersion]);

  const handleToggleCompareMode = useCallback(() => {
    setCompareMode(!isCompareMode);
    if (isCompareMode) {
      setCompareVersion(null);
    }
  }, [isCompareMode, setCompareMode, setCompareVersion]);

  const handleClearComparison = useCallback(() => {
    setSelectedVersion(null);
    setCompareVersion(null);
    setCompareMode(false);
  }, [setSelectedVersion, setCompareVersion, setCompareMode]);

  const expandedVersion = useMemo(
    () => versions.find((v) => v.version.id === expandedVersionId)?.version,
    [versions, expandedVersionId]
  );

  if (isLoading) {
    return (
      <Paper
        elevation={3}
        sx={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          p: 3
        }}
      >
        <Typography color="text.secondary">Loading version history...</Typography>
      </Paper>
    );
  }

  if (error) {
    return (
      <Paper
        elevation={3}
        sx={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          p: 3
        }}
      >
        <Typography color="error">Failed to load versions</Typography>
        <Typography variant="caption" color="text.secondary">
          {String(error)}
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper
      elevation={3}
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden"
      }}
    >
      <Box
        sx={{
          p: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: 1,
          borderColor: "divider"
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <HistoryIcon color="primary" />
          <Typography variant="h6">Version Timeline</Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Tooltip title="Compare versions">
            <IconButton
              onClick={handleToggleCompareMode}
              color={isCompareMode ? "primary" : "default"}
              size="small"
            >
              <CompareIcon />
            </IconButton>
          </Tooltip>
          <IconButton onClick={onClose} size="small">
            <HistoryIcon />
          </IconButton>
        </Box>
      </Box>

      <Box sx={{ p: 1.5, borderBottom: 1, borderColor: "divider" }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            mb: 1
          }}
        >
          <Box sx={{ display: "flex", gap: 0.5 }}>
            {(["all", "manual", "checkpoint", "autosave"] as const).map((type) => (
              <Chip
                key={type}
                label={type === "all" ? "All" : type.charAt(0).toUpperCase() + type.slice(1)}
                size="small"
                variant={filterType === type ? "filled" : "outlined"}
                onClick={() => setFilterType(type)}
                sx={{ cursor: "pointer" }}
              />
            ))}
          </Box>
          {isCompareMode && (selectedVersionId || compareVersionId) && (
            <Button size="small" onClick={handleClearComparison}>
              Clear
            </Button>
          )}
        </Box>
      </Box>

      {isCompareMode && !compareVersionId && (
        <Box
          sx={{
            p: 1,
            bgcolor: alpha(theme.palette.info.main, 0.1)
          }}
        >
          <Typography variant="caption" color="info.main">
            {!selectedVersionId
              ? "Select the first version to compare"
              : "Select the second version to compare"}
          </Typography>
        </Box>
      )}

      {diff && selectedVersion && compareVersion && (
        <Box
          sx={{
            borderBottom: 1,
            borderColor: "divider"
          }}
        >
          <Box sx={{ p: 1, bgcolor: alpha(theme.palette.info.main, 0.05) }}>
            <Typography variant="caption" color="text.secondary" fontWeight="medium">
              Visual Preview (v{Math.min(selectedVersion.version, compareVersion.version)} → v{Math.max(selectedVersion.version, compareVersion.version)})
            </Typography>
            <Box sx={{ display: "flex", gap: 2, mt: 1 }}>
              <GraphVisualDiff
                diff={diff}
                oldGraph={compareVersion.version < selectedVersion.version ? compareVersion.graph : selectedVersion.graph}
                newGraph={compareVersion.version < selectedVersion.version ? selectedVersion.graph : compareVersion.graph}
                width={260}
                height={120}
              />
              <Box sx={{ flex: 1, maxHeight: 120, overflow: "auto" }}>
                <VersionDiff
                  diff={diff}
                  oldVersionNumber={Math.min(selectedVersion.version, compareVersion.version)}
                  newVersionNumber={Math.max(selectedVersion.version, compareVersion.version)}
                />
              </Box>
            </Box>
          </Box>
        </Box>
      )}

      <Box sx={{ flex: 1, overflow: "auto", p: 2 }}>
        {versions.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 4 }}>
            <Typography color="text.secondary">No versions saved yet</Typography>
            <Typography variant="caption" color="text.secondary">
              Save your workflow to create a version
            </Typography>
          </Box>
        ) : (
          <Box sx={{ position: "relative" }}>
            <Box
              sx={{
                position: "absolute",
                left: 16,
                top: 0,
                bottom: 0,
                width: 2,
                bgcolor: "divider"
              }}
            />
            {versions.map((timelineVersion, _index) => {
              const { version } = timelineVersion;
              const isExpanded = expandedVersionId === version.id;
              const isSelected = selectedVersionId === version.id;
              const isCompareTarget = compareVersionId === version.id;
              const saveTypeColor = getSaveTypeColor(version.save_type, theme.palette);

              return (
                <Box key={version.id} sx={{ mb: 2, position: "relative" }}>
                  <Box sx={{ display: "flex", alignItems: "flex-start" }}>
                    <Box sx={{ position: "relative", mr: 2 }}>
                      <Avatar
                        sx={{
                          width: 32,
                          height: 32,
                          bgcolor: alpha(saveTypeColor, 0.15),
                          border: 2,
                          borderColor: saveTypeColor,
                          zIndex: 1
                        }}
                      >
                        {getSaveTypeIcon(version.save_type)}
                      </Avatar>
                      {_index < versions.length - 1 && (
                        <Box
                          sx={{
                            position: "absolute",
                            left: "50%",
                            top: 32,
                            width: 2,
                            height: 40,
                            bgcolor: "divider",
                            transform: "translateX(-50%)"
                          }}
                        />
                      )}
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          mb: 0.5
                        }}
                      >
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <Typography variant="subtitle2">
                            v{version.version}
                          </Typography>
                          <Chip
                            label={getSaveTypeLabel(version.save_type)}
                            size="small"
                            sx={{
                              height: 20,
                              fontSize: "0.65rem",
                              bgcolor: alpha(saveTypeColor, 0.15),
                              color: saveTypeColor
                            }}
                          />
                          {version.name && (
                            <Typography variant="body2" color="text.secondary">
                              {version.name}
                            </Typography>
                          )}
                        </Box>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                          <Typography variant="caption" color="text.secondary">
                            {relativeTime(version.created_at)}
                          </Typography>
                          <IconButton
                            size="small"
                            onClick={(e) => handleMenuOpen(e, version.id)}
                          >
                            <MoreVertIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      </Box>
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                          mb: isExpanded ? 1 : 0
                        }}
                      >
                        <Typography variant="caption" color="text.secondary">
                          {DateTime.fromISO(version.created_at).toFormat("MMM d, yyyy 'at' h:mm a")}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          •
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {version.graph?.nodes?.length || 0} nodes
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          •
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {version.graph?.edges?.length || 0} connections
                        </Typography>
                      </Box>
                      {isExpanded && expandedVersion && (
                        <Box
                          sx={{
                            mt: 2,
                            p: 2,
                            bgcolor: alpha(theme.palette.background.default, 0.5),
                            borderRadius: 1,
                            border: 1,
                            borderColor: "divider"
                          }}
                        >
                          <Box sx={{ display: "flex", gap: 2 }}>
                            <Box sx={{ flex: 1 }}>
                              <Typography variant="caption" color="text.secondary" fontWeight="medium">
                                Workflow Name
                              </Typography>
                              <Typography variant="body2">
                                {version.name || "Untitled"}
                              </Typography>
                            </Box>
                            <Box sx={{ flex: 1 }}>
                              <Typography variant="caption" color="text.secondary" fontWeight="medium">
                                Description
                              </Typography>
                              <Typography variant="body2">
                                {version.description || "No description"}
                              </Typography>
                            </Box>
                          </Box>
                          <Box sx={{ mt: 2, display: "flex", gap: 1 }}>
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<RestoreIcon />}
                              onClick={() => handleRestore(version)}
                              disabled={isRestoringVersion}
                            >
                              Restore
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<DownloadIcon />}
                              onClick={() => handleExportVersion(version)}
                            >
                              Export
                            </Button>
                          </Box>
                        </Box>
                      )}
                      <Box sx={{ display: "flex", gap: 0.5, mt: 1 }}>
                        {isSelected && (
                          <Chip
                            label="Selected"
                            size="small"
                            color="primary"
                            sx={{ height: 20, fontSize: "0.65rem" }}
                          />
                        )}
                        {isCompareTarget && (
                          <Chip
                            label="Comparing"
                            size="small"
                            color="secondary"
                            sx={{ height: 20, fontSize: "0.65rem" }}
                          />
                        )}
                      </Box>
                      <Box sx={{ display: "flex", gap: 0.5, mt: 1 }}>
                        <Button
                          size="small"
                          variant="text"
                          onClick={() => handleSelect(version.id)}
                        >
                          {isCompareMode
                            ? (isSelected ? "Deselect" : "Select to Compare")
                            : (isSelected ? "Deselect" : "View")}
                        </Button>
                        {!isCompareMode && (
                          <Button
                            size="small"
                            variant="text"
                            onClick={() => setExpandedVersionId(isExpanded ? null : version.id)}
                          >
                            {isExpanded ? "Less" : "More"}
                          </Button>
                        )}
                      </Box>
                    </Box>
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </Box>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => setCheckpointDialogOpen(true)}>
          <ListItemIcon>
            <FlagIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Create Checkpoint</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => {
          const found = versions.find(v => v.version.id === menuVersionId);
          if (found) {
            handleExportVersion(found.version);
          }
        }}>
          <ListItemIcon>
            <DownloadIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Export as JSON</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => handleDelete(menuVersionId!)} sx={{ color: "error.main" }}>
          <ListItemIcon>
            <DeleteIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText>Delete Version</ListItemText>
        </MenuItem>
      </Menu>

      <Dialog
        open={checkpointDialogOpen}
        onClose={() => setCheckpointDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Create Checkpoint</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Checkpoint Name"
            fullWidth
            variant="outlined"
            value={checkpointName}
            onChange={(e) => setCheckpointName(e.target.value)}
            placeholder="e.g., Before refactoring"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCheckpointDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleCreateCheckpoint}
            variant="contained"
            disabled={!checkpointName.trim()}
          >
            Create Checkpoint
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>Delete Version</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this version? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleConfirmDelete} color="error" autoFocus>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default VersionTimeline;
