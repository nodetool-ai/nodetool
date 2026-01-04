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
import { useVersionHistoryStore, SaveType } from "../../stores/VersionHistoryStore";
import { useWorkflowVersions } from "../../serverState/useWorkflowVersions";
import { computeGraphDiff, GraphDiff } from "../../utils/graphDiff";
import { WorkflowVersion, Graph } from "../../stores/ApiTypes";
import { NodeUIProperties } from "../../stores/NodeStore";

interface VersionHistoryPanelProps {
  workflowId: string;
  onRestore: (version: WorkflowVersion) => void;
  onClose: () => void;
}

const getSaveType = (version: WorkflowVersion): SaveType => {
  if (version.save_type && ["manual", "autosave", "checkpoint", "restore"].includes(version.save_type)) {
    return version.save_type;
  }
  if (!version.name) return "autosave";
  const lower = version.name.toLowerCase();
  if (lower.includes("manual")) return "manual";
  if (lower.includes("checkpoint")) return "checkpoint";
  if (lower.includes("restore")) return "restore";
  return "autosave";
};

export const VersionHistoryPanel: React.FC<VersionHistoryPanelProps> = ({
  workflowId,
  onRestore,
  onClose
}) => {
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
    isRestoringVersion
  } = useWorkflowVersions(workflowId);

  const [filterType, setFilterType] = useState<SaveType | "all">("all");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [versionToDelete, setVersionToDelete] = useState<string | null>(null);

  const versions: Array<WorkflowVersion & { save_type: SaveType; size_bytes: number }> = useMemo(() => {
    if (!apiVersions?.versions) {
      return [];
    }
    let filtered = apiVersions.versions;
    if (filterType !== "all") {
      filtered = filtered.filter((v) => getSaveType(v) === filterType);
    }
    return filtered.map((v) => ({
      ...v,
      save_type: getSaveType(v),
      size_bytes: new Blob([JSON.stringify(v.graph)]).size
    }));
  }, [apiVersions, filterType]);

  const selectedVersion = useMemo(
    () => versions.find((v) => v.id === selectedVersionId),
    [versions, selectedVersionId]
  );

  const compareVersion = useMemo(
    () => versions.find((v) => v.id === compareVersionId),
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
    selectedVersionId,
    compareVersionId,
    setSelectedVersion,
    setCompareVersion
  ]);

  const handlePin = useCallback((versionId: string, _pinned: boolean) => {
  }, []);

  const handleRestore = useCallback(
    async (version: WorkflowVersion) => {
      console.log("[handleRestore] Version to restore:", {
        id: version.id,
        version: version.version,
        name: version.name,
        saveType: version.save_type,
        graphNodesCount: version.graph?.nodes?.length ?? 0,
        graphEdgesCount: version.graph?.edges?.length ?? 0,
        hasInputSchema: !!(version as any).input_schema,
        hasOutputSchema: !!(version as any).output_schema,
        firstNode: version.graph?.nodes?.[0] ? {
          id: version.graph.nodes[0].id,
          type: version.graph.nodes[0].type,
          ui_properties: version.graph.nodes[0].ui_properties,
          position: (version.graph.nodes[0].ui_properties as NodeUIProperties | undefined)?.position
        } : null,
        firstEdge: version.graph?.edges?.[0] || null
      });
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
        <CircularProgress size={32} sx={{ mb: 2 }} />
        <Typography color="text.secondary">Loading versions...</Typography>
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
          p: 3
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <HistoryIcon color="primary" />
            <Typography variant="h6">Version History</Typography>
          </Box>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
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
          <Typography variant="h6">Version History</Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </Box>

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
              selectedVersion.version,
              compareVersion.version
            )}
            newVersionNumber={Math.max(
              selectedVersion.version,
              compareVersion.version
            )}
          />
        </Box>
      )}

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
                onRestore={handleRestore}
                onDelete={handleDelete}
                onPin={handlePin}
                onCompare={handleCompare}
                isRestoring={isRestoringVersion}
              />
            ))}
          </List>
        )}
      </Box>

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
