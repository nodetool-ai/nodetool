/**
 * Version Timeline Component
 *
 * Research Feature: Visual timeline view of workflow versions for experiment tracking.
 * Shows version history as a vertical timeline with branching support,
 * metrics overview, and quick comparison actions.
 *
 * Status: ⚠️ Experimental - This is a research feature. API may change.
 */

import React, { useCallback, useMemo, useState } from "react";
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Tooltip,
  Chip,
  Avatar,
  Button,
  Collapse,
  TextField,
  Divider,
  useTheme,
  alpha
} from "@mui/material";
import {
  Timeline as TimelineIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  SwapHoriz as SwapHorizIcon,
  Add as AddIcon,
  Comment as CommentIcon,
  Restore as RestoreIcon,
  CallSplit as BranchIcon,
  Straighten as MetricsIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon
} from "@mui/icons-material";
import { VersionMetricsPanel } from "./VersionMetricsPanel";
import { useVersionHistoryStore, SaveType } from "../../stores/VersionHistoryStore";
import { useWorkflowVersions } from "../../serverState/useWorkflowVersions";
import { computeGraphDiff, GraphDiff } from "../../utils/graphDiff";
import { WorkflowVersion, Graph } from "../../stores/ApiTypes";

interface VersionTimelineProps {
  workflowId: string;
  onRestore: (version: WorkflowVersion) => void;
  onCreateBranch: (version: WorkflowVersion, branchName: string) => void;
  onAnnotate: (version: WorkflowVersion, annotation: string) => void;
}

interface TimelineVersion {
  version: WorkflowVersion;
  saveType: SaveType;
  metrics: VersionMetrics;
  annotation?: string;
  branch?: string;
}

interface VersionMetrics {
  nodeCount: number;
  edgeCount: number;
  complexity: number;
  sizeBytes: number;
}

const getSaveType = (version: WorkflowVersion): SaveType => {
  if (version.save_type && ["manual", "autosave", "checkpoint", "restore"].includes(version.save_type)) {
    return version.save_type;
  }
  if (!version.name) {return "autosave";}
  const lower = version.name.toLowerCase();
  if (lower.includes("manual")) {return "manual";}
  if (lower.includes("checkpoint")) {return "checkpoint";}
  if (lower.includes("restore")) {return "restore";}
  return "autosave";
};

const calculateMetrics = (graph: Graph): VersionMetrics => {
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];
  const nodeCount = nodes.length;
  const edgeCount = edges.length;
  const sizeBytes = new Blob([JSON.stringify(graph)]).size;
  const complexity = nodeCount + edgeCount * 2;
  return { nodeCount, edgeCount, complexity, sizeBytes };
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) {return `${bytes} B`;}
  if (bytes < 1024 * 1024) {return `${(bytes / 1024).toFixed(1)} KB`;}
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatComplexity = (complexity: number): string => {
  if (complexity < 10) {return "Low";}
  if (complexity < 30) {return "Medium";}
  if (complexity < 50) {return "High";}
  return "Very High";
};

export const VersionTimeline: React.FC<VersionTimelineProps> = ({
  workflowId,
  onRestore,
  onCreateBranch,
  onAnnotate
}) => {
  const theme = useTheme();
  const {
    selectedVersionId,
    compareVersionId,
    isCompareMode,
    setSelectedVersion,
    setCompareVersion,
    setCompareMode
  } = useVersionHistoryStore();

  const {
    data: apiVersions,
    isLoading,
    error,
    isRestoringVersion
  } = useWorkflowVersions(workflowId);

  const [expandedVersionId, setExpandedVersionId] = useState<string | null>(null);
  const [showMetrics, setShowMetrics] = useState(false);
  const [newAnnotation, setNewAnnotation] = useState<Record<string, string>>({});
  const [newBranchName, setNewBranchName] = useState<Record<string, string>>({});

  const timelineVersions: TimelineVersion[] = useMemo(() => {
    if (!apiVersions?.versions) {
      return [];
    }

    return apiVersions.versions
      .map((v) => ({
        version: v,
        saveType: getSaveType(v),
        metrics: calculateMetrics(v.graph as unknown as Graph),
        annotation: (v as unknown as { annotation?: string })?.annotation
      }))
      .sort((a, b) => b.version.version - a.version.version);
  }, [apiVersions]);

  const selectedVersion = useMemo(
    () => timelineVersions.find((v) => v.version.id === selectedVersionId),
    [timelineVersions, selectedVersionId]
  );

  const compareVersion = useMemo(
    () => timelineVersions.find((v) => v.version.id === compareVersionId),
    [timelineVersions, compareVersionId]
  );

  const diff: GraphDiff | null = useMemo(() => {
    if (!selectedVersion || !compareVersion) {
      return null;
    }
    const [older, newer] =
      selectedVersion.version.version < compareVersion.version.version
        ? [selectedVersion, compareVersion]
        : [compareVersion, selectedVersion];

    return computeGraphDiff(
      older.version.graph as unknown as Graph,
      newer.version.graph as unknown as Graph
    );
  }, [selectedVersion, compareVersion]);

  const handleCompare = useCallback((versionId: string) => {
    if (!selectedVersionId) {
      setSelectedVersion(versionId);
    } else if (selectedVersionId === versionId) {
      setSelectedVersion(null);
    } else {
      setCompareVersion(versionId);
    }
  }, [selectedVersionId, setSelectedVersion, setCompareVersion]);

  const handleToggleExpand = useCallback((versionId: string) => {
    setExpandedVersionId(prev => prev === versionId ? null : versionId);
  }, []);

  const handleAddAnnotation = useCallback((versionId: string) => {
    const annotation = newAnnotation[versionId]?.trim();
    if (annotation && selectedVersion) {
      onAnnotate(selectedVersion.version, annotation);
      setNewAnnotation(prev => ({ ...prev, [versionId]: "" }));
    }
  }, [newAnnotation, onAnnotate, selectedVersion]);

  const handleCreateBranch = useCallback((versionId: string) => {
    const branchName = newBranchName[versionId]?.trim();
    if (branchName && selectedVersion) {
      onCreateBranch(selectedVersion.version, branchName);
      setNewBranchName(prev => ({ ...prev, [versionId]: "" }));
    }
  }, [newBranchName, onCreateBranch, selectedVersion]);

  const getSaveTypeColor = (saveType: SaveType): "primary" | "secondary" | "default" | "success" | "warning" | "error" => {
    switch (saveType) {
      case "manual": return "primary";
      case "autosave": return "secondary";
      case "checkpoint": return "success";
      case "restore": return "warning";
      default: return "default";
    }
  };

  const getComplexityColor = (complexity: number): string => {
    if (complexity < 10) {return theme.palette.success.main;}
    if (complexity < 30) {return theme.palette.warning.main;}
    return theme.palette.error.main;
  };

  const latestMetrics = timelineVersions[0]?.metrics;
  const previousMetrics = timelineVersions[1]?.metrics;

  const metricsDelta = useMemo(() => {
    if (!latestMetrics || !previousMetrics) {return null;}
    return {
      nodes: latestMetrics.nodeCount - previousMetrics.nodeCount,
      edges: latestMetrics.edgeCount - previousMetrics.edgeCount,
      complexity: latestMetrics.complexity - previousMetrics.complexity
    };
  }, [latestMetrics, previousMetrics]);

  if (isLoading) {
    return (
      <Paper elevation={3} sx={{ p: 3, textAlign: "center" }}>
        <TimelineIcon sx={{ mb: 2, color: "text.secondary" }} />
        <Typography color="text.secondary">Loading version history...</Typography>
      </Paper>
    );
  }

  if (error) {
    return (
      <Paper elevation={3} sx={{ p: 3 }}>
        <Typography color="error">Failed to load version timeline</Typography>
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
          <TimelineIcon color="primary" />
          <Typography variant="h6">Version Timeline</Typography>
          <Chip label={`${timelineVersions.length} versions`} size="small" />
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Tooltip title="Show metrics comparison">
            <IconButton
              size="small"
              onClick={() => setShowMetrics(!showMetrics)}
              color={showMetrics ? "primary" : "default"}
            >
              <MetricsIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Compare versions">
            <IconButton
              size="small"
              onClick={() => {
                setCompareMode(!isCompareMode);
                if (isCompareMode) {
                  setCompareVersion(null);
                }
              }}
              color={isCompareMode ? "primary" : "default"}
            >
              <SwapHorizIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Metrics Overview */}
      {showMetrics && latestMetrics && (
        <Box
          sx={{
            p: 2,
            bgcolor: alpha(theme.palette.primary.main, 0.05),
            borderBottom: 1,
            borderColor: "divider"
          }}
        >
          <Typography variant="subtitle2" gutterBottom>
            Latest Version Metrics
          </Typography>
          <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Nodes
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <Typography variant="h6">{latestMetrics.nodeCount}</Typography>
                {metricsDelta && metricsDelta.nodes !== 0 && (
                  <Tooltip title={`${metricsDelta.nodes > 0 ? "+" : ""}${metricsDelta.nodes} from previous`}>
                    {metricsDelta.nodes > 0 ? (
                      <TrendingUpIcon fontSize="small" color="success" />
                    ) : (
                      <TrendingDownIcon fontSize="small" color="error" />
                    )}
                  </Tooltip>
                )}
              </Box>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Connections
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <Typography variant="h6">{latestMetrics.edgeCount}</Typography>
                {metricsDelta && metricsDelta.edges !== 0 && (
                  <Tooltip title={`${metricsDelta.edges > 0 ? "+" : ""}${metricsDelta.edges} from previous`}>
                    {metricsDelta.edges > 0 ? (
                      <TrendingUpIcon fontSize="small" color="success" />
                    ) : (
                      <TrendingDownIcon fontSize="small" color="error" />
                    )}
                  </Tooltip>
                )}
              </Box>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Complexity
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <Typography variant="h6" sx={{ color: getComplexityColor(latestMetrics.complexity) }}>
                  {formatComplexity(latestMetrics.complexity)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  ({latestMetrics.complexity})
                </Typography>
              </Box>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Size
              </Typography>
              <Typography variant="h6">{formatBytes(latestMetrics.sizeBytes)}</Typography>
            </Box>
          </Box>
        </Box>
      )}

      {/* Diff Preview */}
      {diff && selectedVersion && compareVersion && (
        <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
          <VersionMetricsPanel
            diff={diff}
            oldVersion={compareVersion}
            newVersion={selectedVersion}
          />
        </Box>
      )}

      {/* Timeline */}
      <Box sx={{ flex: 1, overflow: "auto", p: 2 }}>
        {timelineVersions.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 4 }}>
            <Typography color="text.secondary">No versions saved yet</Typography>
            <Typography variant="caption" color="text.secondary">
              Save your workflow to create versions
            </Typography>
          </Box>
        ) : (
          <Box sx={{ position: "relative" }}>
            {/* Timeline line */}
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

            {timelineVersions.map((item, index) => {
              const isSelected = selectedVersionId === item.version.id;
              const isCompareTarget = compareVersionId === item.version.id;
              const isExpanded = expandedVersionId === item.version.id;
              const isLatest = index === 0;

              return (
                <Box key={item.version.id} sx={{ mb: 2 }}>
                  {/* Timeline dot */}
                  <Box
                    sx={{
                      position: "relative",
                      zIndex: 1,
                      display: "flex",
                      alignItems: "flex-start"
                    }}
                  >
                    <Avatar
                      sx={{
                        width: 32,
                        height: 32,
                        bgcolor: isLatest ? "primary.main" : "grey.400",
                        fontSize: 12,
                        mr: 2,
                        border: isSelected ? 2 : 0,
                        borderColor: "primary.main"
                      }}
                    >
                      {item.version.version}
                    </Avatar>

                    <Box sx={{ flex: 1 }}>
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          mb: 0.5
                        }}
                      >
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <Typography variant="body2" fontWeight={isLatest ? 600 : 400}>
                            Version {item.version.version}
                          </Typography>
                          <Chip
                            label={item.saveType}
                            size="small"
                            color={getSaveTypeColor(item.saveType)}
                            sx={{ height: 18, fontSize: "0.65rem" }}
                          />
                          {isLatest && (
                            <Chip label="Latest" size="small" color="success" sx={{ height: 18, fontSize: "0.65rem" }} />
                          )}
                          {item.branch && (
                            <Chip
                              icon={<BranchIcon />}
                              label={item.branch}
                              size="small"
                              variant="outlined"
                              sx={{ height: 18, fontSize: "0.65rem" }}
                            />
                          )}
                        </Box>

                        <Box sx={{ display: "flex", gap: 0.5 }}>
                          {isCompareMode && (
                            <Button
                              size="small"
                              variant={isSelected || isCompareTarget ? "contained" : "outlined"}
                              color={isSelected ? "primary" : isCompareTarget ? "secondary" : "inherit"}
                              onClick={() => handleCompare(item.version.id)}
                              sx={{ minWidth: "auto", px: 1 }}
                            >
                              {isSelected ? "Base" : isCompareTarget ? "Compare" : "Select"}
                            </Button>
                          )}
                          <Tooltip title="View details">
                            <IconButton size="small" onClick={() => handleToggleExpand(item.version.id)}>
                              {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </Box>

                      <Typography variant="caption" color="text.secondary">
                        {new Date(item.version.created_at).toLocaleString()}
                        {item.version.name && ` • ${item.version.name}`}
                      </Typography>

                      {/* Metrics chips */}
                      <Box sx={{ display: "flex", gap: 0.5, mt: 0.5 }}>
                        <Chip
                          label={`${item.metrics.nodeCount} nodes`}
                          size="small"
                          sx={{ height: 20, fontSize: "0.65rem" }}
                        />
                        <Chip
                          label={`${item.metrics.edgeCount} edges`}
                          size="small"
                          sx={{ height: 20, fontSize: "0.65rem" }}
                        />
                        <Chip
                          label={formatComplexity(item.metrics.complexity)}
                          size="small"
                          sx={{
                            height: 20,
                            fontSize: "0.65rem",
                            bgcolor: alpha(getComplexityColor(item.metrics.complexity), 0.2),
                            color: getComplexityColor(item.metrics.complexity)
                          }}
                        />
                      </Box>

                      {/* Annotation */}
                      {item.annotation && (
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
                          <CommentIcon fontSize="small" color="info" />
                          <Typography variant="caption">{item.annotation}</Typography>
                        </Box>
                      )}

                      {/* Expanded details */}
                      <Collapse in={isExpanded}>
                        <Box
                          sx={{
                            mt: 1,
                            p: 2,
                            bgcolor: alpha(theme.palette.background.default, 0.5),
                            borderRadius: 1,
                            border: 1,
                            borderColor: "divider"
                          }}
                        >
                          {/* Quick actions */}
                          <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
                            <Button
                              size="small"
                              startIcon={<RestoreIcon />}
                              onClick={() => onRestore(item.version)}
                              disabled={isRestoringVersion}
                            >
                              Restore
                            </Button>
                            <Button
                              size="small"
                              startIcon={<BranchIcon />}
                              onClick={() => handleCreateBranch(item.version.id)}
                            >
                              Branch
                            </Button>
                            <Button
                              size="small"
                              startIcon={<CommentIcon />}
                              onClick={() => handleAddAnnotation(item.version.id)}
                            >
                              Annotate
                            </Button>
                          </Box>

                          {/* Add annotation input */}
                          <TextField
                            size="small"
                            placeholder="Add a note..."
                            value={newAnnotation[item.version.id] || ""}
                            onChange={(e) => setNewAnnotation(prev => ({
                              ...prev,
                              [item.version.id]: e.target.value
                            }))}
                            onKeyPress={(e) => {
                              if (e.key === "Enter") {
                                handleAddAnnotation(item.version.id);
                              }
                            }}
                            InputProps={{
                              endAdornment: (
                                <IconButton size="small" onClick={() => handleAddAnnotation(item.version.id)}>
                                  <AddIcon />
                                </IconButton>
                              )
                            }}
                            sx={{ width: "100%", mb: 1 }}
                          />

                          <Divider sx={{ my: 1 }} />

                          {/* Branch creation */}
                          <Typography variant="caption" color="text.secondary" gutterBottom>
                            Create experiment branch
                          </Typography>
                          <TextField
                            size="small"
                            placeholder="Branch name (e.g., 'prompt-v2-test')"
                            value={newBranchName[item.version.id] || ""}
                            onChange={(e) => setNewBranchName(prev => ({
                              ...prev,
                              [item.version.id]: e.target.value
                            }))}
                            onKeyPress={(e) => {
                              if (e.key === "Enter") {
                                handleCreateBranch(item.version.id);
                              }
                            }}
                            sx={{ width: "100%", mt: 0.5 }}
                          />

                          {/* Technical details */}
                          <Box sx={{ mt: 2 }}>
                            <Typography variant="caption" color="text.secondary">
                              Size: {formatBytes(item.metrics.sizeBytes)} • Created: {
                                new Date(item.version.created_at).toLocaleString()
                              }
                            </Typography>
                          </Box>
                        </Box>
                      </Collapse>
                    </Box>
                  </Box>
                </Box>
              );
            })}
          </Box>
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
          {timelineVersions.length} version(s) • {isCompareMode ? "Compare mode" : "Browse mode"}
        </Typography>
      </Box>
    </Paper>
  );
};

export default VersionTimeline;
