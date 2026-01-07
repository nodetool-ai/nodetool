/**
 * VersionTimeline Component
 *
 * Visualizes workflow version history as an interactive timeline tree.
 * Shows branches, versions, and their relationships over time.
 */

import React, { useCallback, useMemo, useState } from "react";
import {
  Box,
  Typography,
  Paper,
  IconButton,
  Tooltip,
  Chip,
  Avatar,
  Collapse,
  List,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Divider,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField
} from "@mui/material";
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  SwapHoriz as SwitchIcon,
  FiberManualRecord as DotIcon,
  TrendingUp as TrendingUpIcon,
  CallSplit as BranchIcon,
  Timeline as TimelineIcon,
  Check as CheckIcon
} from "@mui/icons-material";
import { formatDistanceToNow } from "date-fns";
import { WorkflowVersion, WorkflowBranch, SaveType } from "../../stores/VersionHistoryStore";
import { useVersionHistoryStore } from "../../stores/VersionHistoryStore";
import { useWorkflowBranches, CreateBranchRequest } from "../../serverState/useWorkflowBranches";

interface VersionTimelineProps {
  workflowId: string;
  versions: Array<WorkflowVersion & { save_type: SaveType; size_bytes: number }>;
  onRestore: (version: WorkflowVersion) => void;
  onSelect: (versionId: string) => void;
  onCompare: (versionId: string) => void;
  isSelected: (versionId: string) => boolean;
  isCompareTarget: (versionId: string) => boolean;
  compareMode: boolean;
  isRestoring: boolean;
}

interface TimelineVersionItemProps {
  version: WorkflowVersion & { save_type: SaveType; size_bytes: number };
  isSelected: boolean;
  isCompareTarget: boolean;
  compareMode: boolean;
  isMainBranch: boolean;
  branchName?: string;
  onSelect: () => void;
  onCompare: () => void;
  onRestore: () => void;
  onCreateBranch: () => void;
  onDeleteBranch?: () => void;
  isRestoring: boolean;
  isNewest: boolean;
  isOldest: boolean;
  hasChildren: boolean;
  level: number;
}

const TimelineVersionItem: React.FC<TimelineVersionItemProps> = ({
  version,
  isSelected,
  isCompareTarget,
  compareMode,
  isMainBranch,
  branchName,
  onSelect,
  onCompare,
  onRestore,
  onCreateBranch,
  onDeleteBranch,
  isRestoring,
  isNewest,
  isOldest,
  hasChildren,
  level
}) => {
  const [showActions, setShowActions] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const getSaveTypeColor = (type: SaveType): "primary" | "secondary" | "default" | "error" | "info" | "success" | "warning" => {
    switch (type) {
      case "manual": return "primary";
      case "checkpoint": return "success";
      case "autosave": return "info";
      case "restore": return "warning";
      default: return "default";
    }
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Box
      sx={{
        position: "relative",
        pl: `${level * 3}px`,
        "&::before": !isOldest ? {
          content: '""',
          position: "absolute",
          left: `${level * 24 + 11}px`,
          top: -20,
          height: "100%",
          width: 2,
          bgcolor: "divider"
        } : {}
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          gap: 1,
          py: 1,
          px: 1,
          borderRadius: 1,
          bgcolor: isSelected ? "rgba(25, 118, 210, 0.08)" :
                   isCompareTarget ? "rgba(2, 136, 209, 0.08)" : "transparent",
          border: isSelected ? "1px solid" : "1px solid transparent",
          borderColor: "primary.main",
          transition: "all 0.2s",
          "&:hover": {
            bgcolor: "action.hover"
          }
        }}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
      >
        {/* Timeline connector */}
        <Box
          sx={{
            position: "relative",
            width: 24,
            height: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0
          }}
        >
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              bgcolor: isSelected ? "primary.main" : "text.secondary",
              border: isSelected ? "2px solid" : "2px solid transparent",
              borderColor: "primary.main",
              zIndex: 1
            }}
          />
          {!isNewest && (
            <Box
              sx={{
                position: "absolute",
                width: 2,
                height: "calc(100% + 1000px)",
                bgcolor: "divider",
                top: 12,
                left: "calc(50% - 1px)"
              }}
            />
          )}
        </Box>

        {/* Version info */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
            <Typography variant="body2" fontWeight="medium">
              v{version.version}
            </Typography>
            <Chip
              label={version.save_type}
              size="small"
              color={getSaveTypeColor(version.save_type)}
              sx={{ height: 20, fontSize: "0.65rem" }}
            />
            {branchName && !isMainBranch && (
              <Chip
                icon={<BranchIcon sx={{ fontSize: 14 }} />}
                label={branchName}
                size="small"
                variant="outlined"
                sx={{ height: 20, fontSize: "0.65rem" }}
              />
            )}
            <Typography variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
              {formatDistanceToNow(new Date(version.created_at), { addSuffix: true })}
            </Typography>
          </Box>

          {version.name && (
            <Typography variant="body2" color="text.secondary" noWrap>
              {version.name}
            </Typography>
          )}

          {version.description && (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
              {version.description}
            </Typography>
          )}

          {/* Action buttons */}
          {showActions && (
            <Box sx={{ display: "flex", gap: 0.5, mt: 1 }}>
              <Tooltip title="Select">
                <IconButton size="small" onClick={onSelect}>
                  <DotIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              {compareMode && (
                <Tooltip title="Compare">
                  <IconButton size="small" onClick={onCompare}>
                    <SwitchIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title="Create Branch">
                <IconButton size="small" onClick={onCreateBranch}>
                  <BranchIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Restore">
                <IconButton
                  size="small"
                  onClick={onRestore}
                  disabled={isRestoring}
                >
                  <TrendingUpIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export const VersionTimeline: React.FC<VersionTimelineProps> = ({
  workflowId,
  versions,
  onRestore,
  onSelect,
  onCompare,
  isSelected,
  isCompareTarget,
  compareMode,
  isRestoring
}) => {
  const {
    branches,
    currentBranchId,
    setBranches,
    setCurrentBranch,
    isCreatingBranch,
    setCreatingBranch
  } = useVersionHistoryStore();

  const {
    data: apiBranches,
    createBranch,
    deleteBranch,
    switchBranch,
    isCreatingBranch: apiIsCreating
  } = useWorkflowBranches(workflowId);

  const [branchDialogOpen, setBranchDialogOpen] = useState(false);
  const [branchToVersion, setBranchToVersion] = useState<number | null>(null);
  const [branchName, setBranchName] = useState("");
  const [branchDescription, setBranchDescription] = useState("");

  const sortedVersions = useMemo(() => {
    return [...versions].sort((a, b) => b.version - a.version);
  }, [versions]);

  const versionMap = useMemo(() => {
    const map = new Map<number, WorkflowVersion & { save_type: SaveType; size_bytes: number }>();
    sortedVersions.forEach(v => map.set(v.version, v));
    return map;
  }, [sortedVersions]);

  const handleCreateBranch = useCallback(async (versionNum: number) => {
    setBranchToVersion(versionNum);
    const version = versionMap.get(versionNum);
    setBranchName(version?.name ? `branch-from-${version.name}` : `branch-${versionNum}`);
    setBranchDescription("");
    setBranchDialogOpen(true);
  }, [versionMap]);

  const handleConfirmCreateBranch = useCallback(async () => {
    if (branchToVersion === null || !branchName.trim()) return;

    try {
      const request: CreateBranchRequest = {
        name: branchName.trim(),
        description: branchDescription.trim() || undefined,
        base_version: branchToVersion
      };
      await createBranch(request);
      setBranchDialogOpen(false);
      setBranchName("");
      setBranchDescription("");
      setBranchToVersion(null);
    } catch (error) {
      console.error("Failed to create branch:", error);
    }
  }, [branchToVersion, branchName, branchDescription, createBranch]);

  const handleSwitchBranch = useCallback(async (branchId: string) => {
    try {
      await switchBranch(branchId);
    } catch (error) {
      console.error("Failed to switch branch:", error);
    }
  }, [switchBranch]);

  const handleDeleteBranch = useCallback(async (branchId: string) => {
    try {
      await deleteBranch(branchId);
    } catch (error) {
      console.error("Failed to delete branch:", error);
    }
  }, [deleteBranch]);

  const groupedByBranch = useMemo(() => {
    const main: Array<WorkflowVersion & { save_type: SaveType; size_bytes: number }> = [];
    const branchGroups: Record<string, Array<WorkflowVersion & { save_type: SaveType; size_bytes: number }>> = {};

    sortedVersions.forEach(v => {
      if (v.branch_id) {
        if (!branchGroups[v.branch_id]) {
          branchGroups[v.branch_id] = [];
        }
        branchGroups[v.branch_id].push(v);
      } else {
        main.push(v);
      }
    });

    return { main, branchGroups };
  }, [sortedVersions]);

  if (versions.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: "center" }}>
        <TimelineIcon sx={{ fontSize: 48, color: "text.secondary", mb: 2 }} />
        <Typography color="text.secondary">
          No versions saved yet
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Save your workflow to create the first version
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: "100%", overflow: "auto" }}>
      {/* Branch selector */}
      {branches.length > 0 && (
        <Box sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}>
          <Typography variant="subtitle2" gutterBottom>
            Active Branch
          </Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Chip
              icon={!currentBranchId ? <CheckIcon /> : undefined}
              label="main"
              onClick={() => setCurrentBranch(null)}
              color={!currentBranchId ? "primary" : "default"}
              variant={!currentBranchId ? "filled" : "outlined"}
              size="small"
            />
            {branches.map(branch => (
              <Chip
                key={branch.id}
                icon={currentBranchId === branch.id ? <CheckIcon /> : undefined}
                label={branch.name}
                onClick={() => setCurrentBranch(branch.id)}
                color={currentBranchId === branch.id ? "primary" : "default"}
                variant={currentBranchId === branch.id ? "filled" : "outlined"}
                size="small"
                onDelete={branch.id !== "main" ? () => handleDeleteBranch(branch.id) : undefined}
              />
            ))}
          </Box>
        </Box>
      )}

      {/* Timeline */}
      <List dense sx={{ py: 1 }}>
        {sortedVersions.map((version, index) => {
          const isNewest = index === 0;
          const isOldest = index === sortedVersions.length - 1;
          const branch = version.branch_id ? branches.find(b => b.id === version.branch_id) : null;

          return (
            <ListItemButton
              key={version.id}
              onClick={() => onSelect(version.id)}
              sx={{
                py: 0,
                px: 1,
                bgcolor: isSelected(version.id) ? "rgba(25, 118, 210, 0.08)" : "transparent",
                border: isSelected(version.id) ? "1px solid" : "1px solid transparent",
                borderColor: "primary.main",
                borderRadius: 1,
                mb: 0.5,
                ml: version.branch_id ? 2 : 0
              }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    bgcolor: isSelected(version.id) ? "primary.main" : "text.secondary"
                  }}
                />
              </ListItemIcon>
              <ListItemText
                primary={
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Typography variant="body2" fontWeight="medium">
                      v{version.version}
                    </Typography>
                    <Chip
                      label={version.save_type}
                      size="small"
                      sx={{ height: 18, fontSize: "0.6rem" }}
                    />
                    {branch && (
                      <Chip
                        icon={<BranchIcon sx={{ fontSize: 12 }} />}
                        label={branch.name}
                        size="small"
                        variant="outlined"
                        sx={{ height: 18, fontSize: "0.6rem" }}
                      />
                    )}
                  </Box>
                }
                secondary={
                  <Box component="span">
                    <Typography variant="caption" color="text.secondary" component="span">
                      {formatDistanceToNow(new Date(version.created_at), { addSuffix: true })}
                    </Typography>
                    {version.name && (
                      <>
                        {" · "}
                        <Typography variant="caption" color="text.secondary" component="span">
                          {version.name}
                        </Typography>
                      </>
                    )}
                  </Box>
                }
              />
              <Box sx={{ display: "flex", gap: 0.5 }}>
                <Tooltip title="Compare">
                  <IconButton size="small" onClick={(e) => { e.stopPropagation(); onCompare(version.id); }}>
                    <SwitchIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Create Branch">
                  <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleCreateBranch(version.version); }}>
                    <BranchIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Restore">
                  <IconButton
                    size="small"
                    onClick={(e) => { e.stopPropagation(); onRestore(version); }}
                    disabled={isRestoring}
                  >
                    <TrendingUpIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            </ListItemButton>
          );
        })}
      </List>

      {/* Create branch dialog */}
      <Dialog open={branchDialogOpen} onClose={() => setBranchDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create Branch</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Create a new branch from version v{branchToVersion}. This will let you experiment without affecting the main version history.
          </Typography>
          <TextField
            autoFocus
            label="Branch Name"
            fullWidth
            value={branchName}
            onChange={(e) => setBranchName(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            label="Description (optional)"
            fullWidth
            multiline
            rows={2}
            value={branchDescription}
            onChange={(e) => setBranchDescription(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBranchDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleConfirmCreateBranch}
            variant="contained"
            disabled={!branchName.trim() || apiIsCreating}
          >
            {apiIsCreating ? "Creating..." : "Create Branch"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default VersionTimeline;
