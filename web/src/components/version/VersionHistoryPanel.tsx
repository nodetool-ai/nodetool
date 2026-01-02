/**
 * VersionHistoryPanel Component
 *
 * Side panel for browsing and managing workflow version history.
 */

import React, { useCallback, useMemo, useState } from "react";
import {
  Box,
  Typography,
  IconButton,
  List,
  Paper,
  Divider,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  CircularProgress
} from "@mui/material";
import {
  Close as CloseIcon,
  Compare as CompareIcon,
  History as HistoryIcon,
  FilterList as FilterIcon
} from "@mui/icons-material";
import { VersionListItem } from "./VersionListItem";
import { VersionDiff } from "./VersionDiff";
import {
  useVersionHistoryStore,
  WorkflowVersion,
  SaveType
} from "../../stores/VersionHistoryStore";
import { computeGraphDiff, GraphDiff } from "../../utils/graphDiff";

interface VersionHistoryPanelProps {
  workflowId: string;
  onRestore: (version: WorkflowVersion) => void;
  onClose: () => void;
}

export const VersionHistoryPanel: React.FC<VersionHistoryPanelProps> = ({
  workflowId,
  onRestore,
  onClose
}) => {
  const {
    getVersions,
    selectedVersionId,
    compareVersionId,
    isCompareMode,
    setSelectedVersion,
    setCompareVersion,
    setCompareMode,
    deleteVersion,
    pinVersion
  } = useVersionHistoryStore();

  const [filterType, setFilterType] = useState<SaveType | "all">("all");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [versionToDelete, setVersionToDelete] = useState<string | null>(null);

  const versions = useMemo(() => {
    const allVersions = getVersions(workflowId);
    if (filterType === "all") {
      return allVersions;
    }
    return allVersions.filter((v) => v.save_type === filterType);
  }, [workflowId, getVersions, filterType]);

  const selectedVersion = useMemo(
    () => versions.find((v) => v.id === selectedVersionId),
    [versions, selectedVersionId]
  );

  const compareVersion = useMemo(
    () => versions.find((v) => v.id === compareVersionId),
    [versions, compareVersionId]
  );

  // Compute diff between selected versions
  const diff: GraphDiff | null = useMemo(() => {
    if (!selectedVersion || !compareVersion) {
      return null;
    }
    // Order by version number (older first)
    const [older, newer] =
      selectedVersion.version_number < compareVersion.version_number
        ? [selectedVersion, compareVersion]
        : [compareVersion, selectedVersion];

    return computeGraphDiff(older.graph_snapshot, newer.graph_snapshot);
  }, [selectedVersion, compareVersion]);

  const handleSelect = useCallback(
    (versionId: string) => {
      setSelectedVersion(
        selectedVersionId === versionId ? null : versionId
      );
    },
    [selectedVersionId, setSelectedVersion]
  );

  const handleCompare = useCallback(
    (versionId: string) => {
      if (!selectedVersionId) {
        setSelectedVersion(versionId);
      } else if (selectedVersionId === versionId) {
        // Deselect if clicking the same version
        setSelectedVersion(null);
      } else {
        setCompareVersion(versionId);
      }
    },
    [selectedVersionId, setSelectedVersion, setCompareVersion]
  );

  const handleDelete = useCallback((versionId: string) => {
    setVersionToDelete(versionId);
    setDeleteDialogOpen(true);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (versionToDelete) {
      deleteVersion(versionToDelete);
      if (selectedVersionId === versionToDelete) {
        setSelectedVersion(null);
      }
      if (compareVersionId === versionToDelete) {
        setCompareVersion(null);
      }
    }
    setDeleteDialogOpen(false);
    setVersionToDelete(null);
  }, [
    versionToDelete,
    deleteVersion,
    selectedVersionId,
    compareVersionId,
    setSelectedVersion,
    setCompareVersion
  ]);

  const handlePin = useCallback(
    (versionId: string, pinned: boolean) => {
      pinVersion(versionId, pinned);
    },
    [pinVersion]
  );

  const handleFilterChange = useCallback(
    (
      _event: React.MouseEvent<HTMLElement>,
      newFilter: SaveType | "all" | null
    ) => {
      if (newFilter !== null) {
        setFilterType(newFilter);
      }
    },
    []
  );

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

  return (
    <Paper
      elevation={3}
      sx={{
        width: 360,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden"
      }}
    >
      {/* Header */}
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
          <Typography variant="h6">Version History</Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Toolbar */}
      <Box sx={{ p: 1, borderBottom: 1, borderColor: "divider" }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            mb: 1
          }}
        >
          <Tooltip title="Compare versions">
            <ToggleButton
              value="compare"
              selected={isCompareMode}
              onChange={handleToggleCompareMode}
              size="small"
              sx={{ px: 1 }}
            >
              <CompareIcon fontSize="small" sx={{ mr: 0.5 }} />
              Compare
            </ToggleButton>
          </Tooltip>

          {isCompareMode && (selectedVersionId || compareVersionId) && (
            <Button size="small" onClick={handleClearComparison}>
              Clear
            </Button>
          )}
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <FilterIcon fontSize="small" color="action" />
          <ToggleButtonGroup
            value={filterType}
            exclusive
            onChange={handleFilterChange}
            size="small"
            aria-label="version filter"
          >
            <ToggleButton value="all" aria-label="all">
              All
            </ToggleButton>
            <ToggleButton value="manual" aria-label="manual">
              Manual
            </ToggleButton>
            <ToggleButton value="autosave" aria-label="autosave">
              Auto
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Box>

      {/* Compare Instructions */}
      {isCompareMode && !compareVersionId && (
        <Box
          sx={{
            p: 1,
            bgcolor: "rgba(2, 136, 209, 0.1)"
          }}
        >
          <Typography variant="caption" color="info.main">
            {!selectedVersionId
              ? "Select the first version to compare"
              : "Select the second version to compare"}
          </Typography>
        </Box>
      )}

      {/* Diff View */}
      {diff && selectedVersion && compareVersion && (
        <Box
          sx={{
            p: 1,
            maxHeight: 200,
            overflow: "auto",
            borderBottom: 1,
            borderColor: "divider"
          }}
        >
          <VersionDiff
            diff={diff}
            oldVersionNumber={Math.min(
              selectedVersion.version_number,
              compareVersion.version_number
            )}
            newVersionNumber={Math.max(
              selectedVersion.version_number,
              compareVersion.version_number
            )}
          />
        </Box>
      )}

      {/* Version List */}
      <Box sx={{ flex: 1, overflow: "auto" }}>
        {versions.length === 0 ? (
          <Box sx={{ p: 3, textAlign: "center" }}>
            <Typography color="text.secondary">
              No versions saved yet
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Save your workflow to create a version
            </Typography>
          </Box>
        ) : (
          <List dense sx={{ py: 1 }}>
            {versions.map((version) => (
              <VersionListItem
                key={version.id}
                version={version}
                isSelected={selectedVersionId === version.id}
                isCompareTarget={compareVersionId === version.id}
                compareMode={isCompareMode}
                onSelect={handleSelect}
                onRestore={onRestore}
                onDelete={handleDelete}
                onPin={handlePin}
                onCompare={handleCompare}
              />
            ))}
          </List>
        )}
      </Box>

      {/* Footer */}
      <Box
        sx={{
          p: 1,
          borderTop: 1,
          borderColor: "divider",
          bgcolor: "background.paper"
        }}
      >
        <Typography variant="caption" color="text.secondary">
          {versions.length} version(s) saved
        </Typography>
      </Box>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>Delete Version</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this version? This action cannot be
            undone.
          </DialogContentText>
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
