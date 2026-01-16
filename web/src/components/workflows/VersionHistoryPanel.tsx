import React from "react";
import {
  Box,
  Drawer,
  Typography,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
  Button,
  Chip,
  Tooltip,
  Paper,
  Menu,
  MenuItem,
} from "@mui/material";
import {
  Close,
  History,
  CompareArrows,
  Restore,
  Delete,
  MoreVert,
  Save,
  Schedule,
} from "@mui/icons-material";
import { useTheme } from "@mui/material/styles";
import { format } from "date-fns";
import {
  useVersionHistoryStore,
  WorkflowVersion,
} from "../../stores/VersionHistoryStore";
import { WorkflowDiffViewer } from "./WorkflowDiffViewer";
import { useWorkflowDiff } from "../../hooks/useWorkflowDiff";

interface VersionHistoryPanelProps {
  workflowId: string;
  versions: WorkflowVersion[];
  onRestoreVersion?: (version: WorkflowVersion) => void;
  onClose?: () => void;
  width?: number | string;
}

export const VersionHistoryPanel: React.FC<VersionHistoryPanelProps> = ({
  workflowId,
  versions,
  onRestoreVersion,
  onClose,
  width = 400,
}) => {
  const theme = useTheme();
  const {
    selectedVersionId,
    compareVersionId,
    isCompareMode,
    isHistoryPanelOpen,
    setSelectedVersion,
    setCompareVersion,
    setCompareMode,
    setHistoryPanelOpen,
  } = useVersionHistoryStore();

  const [menuAnchor, setMenuAnchor] = React.useState<null | HTMLElement>(null);
  const [selectedMenuVersion, setSelectedMenuVersion] = React.useState<WorkflowVersion | null>(
    null
  );

  const selectedVersion = versions.find((v) => v.id === selectedVersionId);
  const compareVersion = versions.find((v) => v.id === compareVersionId);

  const diff = useWorkflowDiff(
    isCompareMode && compareVersion ? compareVersion : null,
    selectedVersion || null
  );

  const handleVersionSelect = (version: WorkflowVersion) => {
    if (isCompareMode) {
      setCompareVersion(version.id);
    } else {
      setSelectedVersion(version.id);
    }
  };

  const handleToggleCompareMode = () => {
    setCompareMode(!isCompareMode);
    if (isCompareMode) {
      setCompareVersion(null);
    }
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, version: WorkflowVersion) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
    setSelectedMenuVersion(version);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
    setSelectedMenuVersion(null);
  };

  const handleRestore = () => {
    if (selectedMenuVersion && onRestoreVersion) {
      onRestoreVersion(selectedMenuVersion);
    }
    handleMenuClose();
  };

  const sortedVersions = [...versions].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const getSaveTypeIcon = (saveType?: string) => {
    switch (saveType) {
      case "manual":
        return <Save fontSize="small" color="primary" />;
      case "autosave":
        return <Schedule fontSize="small" color="action" />;
      case "checkpoint":
        return <History fontSize="small" color="warning" />;
      default:
        return <History fontSize="small" />;
    }
  };

  return (
    <Drawer
      anchor="right"
      open={isHistoryPanelOpen}
      onClose={() => {
        setHistoryPanelOpen(false);
        onClose?.();
      }}
      PaperProps={{
        sx: { width, display: "flex", flexDirection: "column" },
      }}
    >
      <Box sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Typography variant="h6" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <History />
            Version History
          </Typography>
          <IconButton
            size="small"
            onClick={() => {
              setHistoryPanelOpen(false);
              onClose?.();
            }}
          >
            <Close />
          </IconButton>
        </Box>

        <Box sx={{ mt: 2, display: "flex", gap: 1 }}>
          <Button
            variant={isCompareMode ? "contained" : "outlined"}
            startIcon={<CompareArrows />}
            onClick={handleToggleCompareMode}
            size="small"
            fullWidth
          >
            {isCompareMode ? "Comparing Versions" : "Compare Versions"}
          </Button>
        </Box>

        {isCompareMode && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
            Select a version to view, then select another to compare
          </Typography>
        )}
      </Box>

      <Box sx={{ flex: 1, overflow: "auto", p: 1 }}>
        {versions.length === 0 ? (
          <Box sx={{ p: 3, textAlign: "center" }}>
            <Typography color="text.secondary">No version history available</Typography>
            <Typography variant="caption" color="text.secondary">
              Versions are created when you save or checkpoint a workflow
            </Typography>
          </Box>
        ) : (
          <List dense>
            {sortedVersions.map((version, index) => {
              const isSelected = version.id === selectedVersionId;
              const isCompareSelected = version.id === compareVersionId;

              return (
                <React.Fragment key={version.id}>
                  {index > 0 && <Divider component="li" />}
                  <ListItem
                    disablePadding
                    sx={{
                      mb: 0.5,
                    }}
                  >
                    <ListItemButton
                      selected={isSelected || isCompareSelected}
                      onClick={() => handleVersionSelect(version)}
                      sx={{
                        borderRadius: 1,
                        "&.Mui-selected": {
                          bgcolor:
                            isCompareSelected && isCompareMode
                              ? "info.lighter"
                              : "primary.lighter",
                        },
                        "&:hover": {
                          bgcolor:
                            isCompareSelected && isCompareMode
                              ? "info.light"
                              : "primary.light",
                        },
                      }}
                    >
                      <Box sx={{ mr: 1, display: "flex", alignItems: "center" }}>
                        {getSaveTypeIcon(version.save_type)}
                      </Box>
                      <ListItemText
                        primary={
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <Typography variant="body2" fontWeight="medium">
                              v{version.version}
                            </Typography>
                            {isCompareSelected && isCompareMode && (
                              <Chip label="Compare" size="small" color="info" />
                            )}
                            {isSelected && !isCompareMode && (
                              <Chip label="Viewing" size="small" color="primary" />
                            )}
                          </Box>
                        }
                        secondary={
                          <Box>
                            <Typography variant="caption" component="span">
                              {format(new Date(version.created_at), "MMM d, yyyy HH:mm")}
                            </Typography>
                            {version.name && (
                              <>
                                {" • "}
                                <Typography variant="caption" component="span">
                                  {version.name}
                                </Typography>
                              </>
                            )}
                          </Box>
                        }
                      />
                      <ListItemSecondaryAction>
                        <IconButton
                          edge="end"
                          size="small"
                          onClick={(e) => handleMenuOpen(e, version)}
                        >
                          <MoreVert fontSize="small" />
                        </IconButton>
                      </ListItemSecondaryAction>
                    </ListItemButton>
                  </ListItem>
                </React.Fragment>
              );
            })}
          </List>
        )}
      </Box>

      {selectedVersion && !isCompareMode && (
        <Box
          sx={{
            borderTop: `1px solid ${theme.palette.divider}`,
            p: 2,
            maxHeight: "40%",
            overflow: "auto",
          }}
        >
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Version Details
          </Typography>
          <Paper variant="outlined" sx={{ p: 1 }}>
            <Typography variant="body2">
              <strong>Nodes:</strong> {selectedVersion.graph.nodes.length}
            </Typography>
            <Typography variant="body2">
              <strong>Connections:</strong> {selectedVersion.graph.edges.length}
            </Typography>
            {selectedVersion.description && (
              <Typography variant="body2" sx={{ mt: 1 }}>
                {selectedVersion.description}
              </Typography>
            )}
            <Box sx={{ mt: 2, display: "flex", gap: 1 }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<Restore />}
                onClick={() => onRestoreVersion?.(selectedVersion)}
              >
                Restore
              </Button>
            </Box>
          </Paper>
        </Box>
      )}

      {isCompareMode && selectedVersion && compareVersion && (
        <Box
          sx={{
            borderTop: `1px solid ${theme.palette.divider}`,
            p: 2,
            maxHeight: "40%",
            overflow: "auto",
          }}
        >
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Changes (v{compareVersion.version} → v{selectedVersion.version})
          </Typography>
          <WorkflowDiffViewer diff={diff} compact />
        </Box>
      )}

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={handleMenuClose}>
        <MenuItem onClick={handleRestore}>
          <Restore fontSize="small" sx={{ mr: 1 }} />
          Restore this version
        </MenuItem>
        <MenuItem onClick={handleMenuClose} disabled>
          <Delete fontSize="small" sx={{ mr: 1 }} />
          Delete version
        </MenuItem>
      </Menu>
    </Drawer>
  );
};

export default VersionHistoryPanel;
