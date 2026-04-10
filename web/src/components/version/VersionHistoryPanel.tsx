/**
 * VersionHistoryPanel Component
 *
 * Side panel for browsing and managing workflow version history.
 */

import React, { useCallback, useMemo, useState, memo } from "react";
import {
  List,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText
} from "@mui/material";
import {
  Compare as CompareIcon,
  FilterList as FilterIcon
} from "@mui/icons-material";
import VersionListItem from "./VersionListItem";
import { VersionDiff } from "./VersionDiff";
import { GraphVisualDiff } from "./GraphVisualDiff";
import { useVersionHistoryStore, SaveType } from "../../stores/VersionHistoryStore";
import { useWorkflowVersions } from "../../serverState/useWorkflowVersions";
import { computeGraphDiff, GraphDiff } from "../../utils/graphDiff";
import { WorkflowVersion, Graph } from "../../stores/ApiTypes";
import PanelHeadline from "../ui/PanelHeadline";
import {
  Caption,
  CloseButton,
  DialogActionButtons,
  FlexColumn,
  LoadingSpinner,
  Text,
  ToggleGroup,
  ToggleOption,
  Tooltip
} from "../ui_primitives";
import log from "loglevel";

interface VersionHistoryPanelProps {
  workflowId: string;
  onRestore: (version: WorkflowVersion) => void;
  onClose: () => void;
}

// Helper function to calculate graph size efficiently
// Uses a simple approximation instead of creating a Blob
const getGraphSizeBytes = (graph: Graph): number => {
  try {
    // Use JSON.stringify length as an approximation
    // This is much faster than creating a Blob
    return JSON.stringify(graph).length * 2; // Approximate UTF-16 byte size
  } catch {
    return 0;
  }
};

const getSaveType = (version: WorkflowVersion): SaveType => {
  if (version.save_type && ["manual", "autosave", "checkpoint", "restore"].includes(version.save_type)) {
    return version.save_type as SaveType;
  }
  if (!version.name) {return "autosave";}
  const lower = version.name.toLowerCase();
  if (lower.includes("manual")) {return "manual";}
  if (lower.includes("checkpoint")) {return "checkpoint";}
  if (lower.includes("restore")) {return "restore";}
  return "autosave";
};

export const VersionHistoryPanel: React.FC<VersionHistoryPanelProps> = ({
  workflowId,
  onRestore,
  onClose
}) => {
  const selectedVersionId = useVersionHistoryStore((state) => state.selectedVersionId);
  const compareVersionId = useVersionHistoryStore((state) => state.compareVersionId);
  const isCompareMode = useVersionHistoryStore((state) => state.isCompareMode);
  const setSelectedVersion = useVersionHistoryStore((state) => state.setSelectedVersion);
  const setCompareVersion = useVersionHistoryStore((state) => state.setCompareVersion);
  const setCompareMode = useVersionHistoryStore((state) => state.setCompareMode);
  const setHistoryPanelOpen = useVersionHistoryStore((state) => state.setHistoryPanelOpen);

  const {
    data: apiVersions,
    isLoading,
    error,
    restoreVersion,
    isRestoringVersion,
    deleteVersion
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
      size_bytes: getGraphSizeBytes(v.graph)
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

  const handleConfirmDelete = useCallback(async () => {
    if (versionToDelete) {
      try {
        await deleteVersion(versionToDelete);
        if (selectedVersionId === versionToDelete) {
          setSelectedVersion(null);
        }
        if (compareVersionId === versionToDelete) {
          setCompareVersion(null);
        }
      } catch (error) {
        log.error("Failed to delete version:", error);
      }
    }
    setDeleteDialogOpen(false);
    setVersionToDelete(null);
  }, [
    versionToDelete,
    selectedVersionId,
    compareVersionId,
    setSelectedVersion,
    setCompareVersion,
    deleteVersion
  ]);

  const handleRestore = useCallback(
    async (version: WorkflowVersion) => {
      try {
        await restoreVersion(version.version);
        onRestore(version);
        setHistoryPanelOpen(false);
      } catch (error) {
        log.error("Failed to restore version:", error);
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

  const handleCloseDeleteDialog = useCallback(() => {
    setDeleteDialogOpen(false);
  }, []);

  if (isLoading) {
    return (
      <div
        style={{
          backgroundColor: "var(--palette-background-default)",
          width: "100%",
          height: "100%",
          padding: "24px"
        }}
      >
        <FlexColumn align="center" justify="center" fullHeight>
          <LoadingSpinner size="medium" text="Loading versions..." />
        </FlexColumn>
      </div>
    );
  }

  if (error) {
    return (
      <FlexColumn
        padding={3}
        sx={{
          backgroundColor: "var(--palette-background-default)",
          width: "100%",
          height: "100%"
        }}
      >
        <PanelHeadline
          title="Version History"
          actions={
            <CloseButton onClick={onClose} buttonSize="small" tooltip="Close" />
          }
        />
        <Text color="error">Failed to load versions</Text>
        <Text size="tiny" color="secondary">{String(error)}</Text>
      </FlexColumn>
    );
  }

  return (
    <div
      className="version-history-panel"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        padding: "0 1em",
        flexDirection: "column",
        overflow: "hidden"
      }}
    >
      <div
        className="version-history-panel-header"
        style={{ borderBottom: "1px solid var(--palette-divider)" }}
      >
        <PanelHeadline
          title="Version History"
          actions={
            <CloseButton onClick={onClose} buttonSize="small" tooltip="Close" />
          }
        />
      </div>

      <div style={{
        padding: "4px 8px",
        borderBottom: "1px solid var(--palette-divider)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "8px"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <FilterIcon sx={{ fontSize: 16, color: "text.secondary" }} />
          <ToggleGroup
            value={filterType}
            exclusive
            onChange={handleFilterChange}
            compact
            aria-label="version filter"
          >
            <ToggleOption value="all" aria-label="all">All</ToggleOption>
            <ToggleOption value="manual" aria-label="manual">Manual</ToggleOption>
            <ToggleOption value="autosave" aria-label="autosave">Auto</ToggleOption>
          </ToggleGroup>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <Tooltip title="Compare two versions side by side">
            <Button
              size="small"
              variant={isCompareMode ? "contained" : "text"}
              onClick={handleToggleCompareMode}
              startIcon={<CompareIcon sx={{ fontSize: "14px !important" }} />}
              sx={{
                fontSize: "0.7rem",
                py: 0.25,
                px: 1,
                minWidth: 0,
                textTransform: "none",
                color: isCompareMode ? undefined : "text.secondary"
              }}
            >
              Compare
            </Button>
          </Tooltip>

          {isCompareMode && (selectedVersionId || compareVersionId) && (
            <Button
              size="small"
              onClick={handleClearComparison}
              sx={{ fontSize: "0.7rem", py: 0.25, px: 0.5, minWidth: 0, textTransform: "none" }}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {isCompareMode && !compareVersionId && (
        <div style={{
          padding: "4px 8px",
          backgroundColor: "rgba(2, 136, 209, 0.08)"
        }}>
          <Caption size="tiny" color="primary">
            {!selectedVersionId
              ? "Select the first version to compare"
              : "Select the second version to compare"}
          </Caption>
        </div>
      )}

      {diff && selectedVersion && compareVersion && (
        <div style={{ borderBottom: "1px solid var(--palette-divider)" }}>
          <div style={{ padding: "4px 8px", backgroundColor: "rgba(2, 136, 209, 0.05)" }}>
            <Caption size="tiny" color="secondary" sx={{ fontWeight: 500 }}>
              Visual Preview
            </Caption>
            <GraphVisualDiff
              diff={diff}
              oldGraph={compareVersion.version < selectedVersion.version ? compareVersion.graph : selectedVersion.graph}
              newGraph={compareVersion.version < selectedVersion.version ? selectedVersion.graph : compareVersion.graph}
              width={280}
              height={140}
            />
          </div>
          <div style={{
            padding: "4px 8px",
            maxHeight: 200,
            overflow: "auto"
          }}>
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
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflow: "auto" }}>
        {versions.length === 0 ? (
          <div style={{ padding: "16px", textAlign: "center" }}>
            <Text color="secondary">No versions saved yet</Text>
            <Caption size="tiny" color="muted">
              Save your workflow to create a version
            </Caption>
          </div>
        ) : (
          <List dense sx={{ py: 0 }}>
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
                onCompare={handleCompare}
                isRestoring={isRestoringVersion}
              />
            ))}
          </List>
        )}
      </div>

      <div style={{
        padding: "4px 8px",
        borderTop: "1px solid var(--palette-divider)"
      }}>
        <Caption size="tiny" color="muted">
          {versions.length} version{versions.length !== 1 ? "s" : ""} saved
        </Caption>
      </div>

      <Dialog
        open={deleteDialogOpen}
        onClose={handleCloseDeleteDialog}
      >
        <DialogTitle>Delete Version</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this version? This action cannot be
            undone.
          </DialogContentText>
        </DialogContent>
        <DialogActionButtons
          onConfirm={handleConfirmDelete}
          onCancel={handleCloseDeleteDialog}
          confirmText="Delete"
          destructive
        />
      </Dialog>
    </div>
  );
};

export default memo(VersionHistoryPanel);
