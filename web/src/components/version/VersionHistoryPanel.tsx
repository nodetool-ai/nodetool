/**
 * VersionHistoryPanel Component
 *
 * Side panel for browsing and managing workflow version history.
 */

import React, { useCallback, useMemo, useState, memo } from "react";
import { Compare as CompareIcon } from "@mui/icons-material";
import VersionListItem from "./VersionListItem";
import { VersionDiff } from "./VersionDiff";
import { GraphVisualDiff } from "./GraphVisualDiff";
import { WorkflowGraphPreview } from "./WorkflowGraphPreview";
import { useVersionHistoryStore, SaveType } from "../../stores/VersionHistoryStore";
import { useWorkflowVersions } from "../../serverState/useWorkflowVersions";
import { computeGraphDiff, GraphDiff } from "../../utils/graphDiff";
import { WorkflowVersion, Graph } from "../../stores/ApiTypes";
import { formatDistanceToNow, format } from "date-fns";
import PanelToolbar from "../panels/PanelToolbar";
import {
  Caption,
  Chip,
  CloseButton,
  Dialog,
  EditorButton,
  FlexColumn,
  ListGroup,
  LoadingSpinner,
  Text,
  ToggleGroup,
  ToggleOption,
  Tooltip,
  SPACING,
  getSpacingPx
} from "../ui_primitives";

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
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
        console.error("Failed to delete version:", error);
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
          padding: getSpacingPx(SPACING.xxl)
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
        sx={{
          backgroundColor: "var(--palette-background-default)",
          width: "100%",
          height: "100%"
        }}
      >
        <PanelToolbar
          title="Version History"
          actions={
            <CloseButton onClick={onClose} buttonSize="small" tooltip="Close" />
          }
        />
        <FlexColumn padding={3} gap={0.5}>
          <Text color="error">Failed to load versions</Text>
          <Text size="tiny" color="secondary">{String(error)}</Text>
        </FlexColumn>
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
        flexDirection: "column",
        overflow: "hidden"
      }}
    >
      <PanelToolbar
        title="Versions"
        count={versions.length}
        actions={
          <>
            {isCompareMode && (selectedVersionId || compareVersionId) && (
              <EditorButton
                density="compact"
                variant="text"
                onClick={handleClearComparison}
                sx={{ fontSize: "var(--fontSizeSmaller)", py: 0.5, px: 0.5, minWidth: 0 }}
              >
                Clear
              </EditorButton>
            )}
            <Tooltip title="Compare two versions side by side">
              <EditorButton
                density="compact"
                variant={isCompareMode ? "contained" : "text"}
                onClick={handleToggleCompareMode}
                sx={{
                  fontSize: "var(--fontSizeSmaller)",
                  py: 0.5,
                  px: 1,
                  minWidth: 0,
                  color: isCompareMode ? undefined : "text.secondary"
                }}
              >
                <CompareIcon sx={{ fontSize: "14px !important", mr: 0.5 }} />
                Compare
              </EditorButton>
            </Tooltip>
            <CloseButton onClick={onClose} buttonSize="small" tooltip="Close" />
          </>
        }
      >
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
      </PanelToolbar>

      {isCompareMode && !compareVersionId && (
        <div style={{
          padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.lg)}`,
          backgroundColor: "rgba(2, 136, 209, 0.08)"
        }}>
          <Caption size="tiny" color="primary">
            {!selectedVersionId
              ? "Select the first version to compare"
              : "Select the second version to compare"}
          </Caption>
        </div>
      )}

      <div
        style={{
          flex: 1,
          display: "flex",
          minHeight: 0,
          overflow: "hidden"
        }}
      >
        <div
          className="version-list-pane"
          style={{
            width: 360,
            flexShrink: 0,
            borderRight: "1px solid var(--palette-divider)",
            overflowY: "auto",
            overflowX: "hidden"
          }}
        >
          {versions.length === 0 ? (
            <div style={{ padding: getSpacingPx(SPACING.xl), textAlign: "center" }}>
              <Text color="secondary">No versions saved yet</Text>
              <Caption size="tiny" color="muted">
                Save your workflow to create a version
              </Caption>
            </div>
          ) : (
            <ListGroup compact flush sx={{ py: 0 }}>
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
            </ListGroup>
          )}
        </div>

        <div
          className="version-preview-pane"
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "auto",
            padding: `${getSpacingPx(SPACING.xl)} ${getSpacingPx(SPACING.xxl)}` // was 16px 20px
          }}
        >
          {diff && selectedVersion && compareVersion ? (
            <FlexColumn gap={2} fullHeight>
              <div>
                <Caption size="tiny" color="muted" sx={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Comparing v{Math.min(selectedVersion.version, compareVersion.version)}
                  {" "}↔{" "}
                  v{Math.max(selectedVersion.version, compareVersion.version)}
                </Caption>
              </div>
              <GraphVisualDiff
                diff={diff}
                oldGraph={
                  compareVersion.version < selectedVersion.version
                    ? compareVersion.graph
                    : selectedVersion.graph
                }
                newGraph={
                  compareVersion.version < selectedVersion.version
                    ? selectedVersion.graph
                    : compareVersion.graph
                }
                width={640}
                height={320}
              />
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
            </FlexColumn>
          ) : selectedVersion ? (
            <FlexColumn gap={2}>
              <div style={{ display: "flex", alignItems: "baseline", gap: getSpacingPx(SPACING.md), flexWrap: "wrap" }}>
                <Text size="bigger" weight={600}>
                  v{selectedVersion.version}
                </Text>
                <Chip
                  label={getSaveTypeLabel(selectedVersion.save_type)}
                  size="small"
                  variant="outlined"
                />
                {selectedVersion.created_at && (
                  <Caption size="tiny" color="secondary">
                    {format(
                      new Date(selectedVersion.created_at),
                      "MMM d, yyyy · HH:mm"
                    )}
                    {" · "}
                    {formatDistanceToNow(
                      new Date(selectedVersion.created_at),
                      { addSuffix: true }
                    )}
                  </Caption>
                )}
                <Caption size="tiny" color="muted" sx={{ marginLeft: "auto" }}>
                  {formatBytes(selectedVersion.size_bytes)}
                </Caption>
              </div>

              {(selectedVersion.name || selectedVersion.description) && (
                <FlexColumn gap={0.5}>
                  {selectedVersion.name && (
                    <Text size="small" weight={500}>
                      {selectedVersion.name}
                    </Text>
                  )}
                  {selectedVersion.description && (
                    <Caption size="small" color="secondary">
                      {selectedVersion.description}
                    </Caption>
                  )}
                </FlexColumn>
              )}

              <WorkflowGraphPreview
                graph={selectedVersion.graph as unknown as Graph}
                workflowId={workflowId}
                width="100%"
                height={320}
              />

              <div style={{ display: "flex", gap: getSpacingPx(SPACING.md), marginTop: getSpacingPx(SPACING.md) }}>
                <EditorButton
                  density="compact"
                  variant="contained"
                  onClick={() => handleRestore(selectedVersion)}
                  disabled={isRestoringVersion}
                >
                  {isRestoringVersion ? (
                    <LoadingSpinner size="small" />
                  ) : (
                    "Restore this version"
                  )}
                </EditorButton>
                <EditorButton
                  density="compact"
                  variant="text"
                  onClick={() => handleDelete(selectedVersion.id)}
                  sx={{ color: "text.secondary" }}
                >
                  Delete
                </EditorButton>
              </div>
            </FlexColumn>
          ) : (
            <FlexColumn
              align="center"
              justify="center"
              fullHeight
              gap={1}
              sx={{ color: "text.secondary", textAlign: "center" }}
            >
              <Text color="secondary">
                Select a version to preview
              </Text>
              <Caption size="tiny" color="muted">
                {isCompareMode
                  ? "Pick two versions to see what changed."
                  : "Click any entry to see its graph and metadata here."}
              </Caption>
            </FlexColumn>
          )}
        </div>
      </div>

      <Dialog
        open={deleteDialogOpen}
        onClose={handleCloseDeleteDialog}
        title="Delete Version"
        onConfirm={handleConfirmDelete}
        onCancel={handleCloseDeleteDialog}
        confirmText="Delete"
        destructive
      >
        <Text color="secondary">
          Are you sure you want to delete this version? This action cannot be
          undone.
        </Text>
      </Dialog>
    </div>
  );
};

export default memo(VersionHistoryPanel);
