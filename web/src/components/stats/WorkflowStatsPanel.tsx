/**
 * Workflow Statistics Panel
 *
 * Displays detailed statistics about the current workflow including:
 * - Node and connection counts
 * - Complexity analysis
 * - Connectivity metrics
 * - Health indicators and suggestions
 */

import React, { useEffect, useMemo } from "react";
import {
  Box,
  Typography,
  Paper,
  LinearProgress,
  Chip,
  IconButton,
  Collapse,
  Divider
} from "@mui/material";
import {
  Close as CloseIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Info as InfoIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  TrendingUp as TrendingUpIcon,
  AccountTree as GraphIcon,
  Speed as SpeedIcon,
  HealthAndSafety as HealthIcon
} from "@mui/icons-material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useStoreWithEqualityFn } from "zustand/traditional";
import isEqual from "lodash/isEqual";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { NodeContext } from "../../contexts/NodeContext";
import useWorkflowStatsStore from "../../stores/WorkflowStatsStore";
import {
  getComplexityColor,
  getHealthColor,
  HealthIssue,
  ComplexityFactor
} from "../../utils/workflowStats";

interface WorkflowStatsPanelProps {
  onClose: () => void;
}

const NODE_TYPE_ICONS: Record<string, React.ReactNode> = {
  input: <Box sx={{ color: "#10B981" }}>📥</Box>,
  output: <Box sx={{ color: "#3B82F6" }}>📤</Box>,
  llm: <Box sx={{ color: "#8B5CF6" }}>🧠</Box>,
  image: <Box sx={{ color: "#D946EF" }}>🖼️</Box>,
  video: <Box sx={{ color: "#8B5CF6" }}>🎬</Box>,
  audio: <Box sx={{ color: "#0EA5E9" }}>🎵</Box>,
  text: <Box sx={{ color: "#F59E0B" }}>📝</Box>,
  condition: <Box sx={{ color: "#F43F5E" }}>🔀</Box>,
  math: <Box sx={{ color: "#22D3EE" }}>🔢</Box>,
  data: <Box sx={{ color: "#FACC15" }}>📦</Box>,
  agent: <Box sx={{ color: "#EC4899" }}>🤖</Box>,
  transform: <Box sx={{ color: "#06B6D4" }}>🔄</Box>,
  other: <Box sx={{ color: "#6B7280" }}>📦</Box>
};

const getNodeTypeColor = (type: string): string => {
  switch (type) {
    case "input":
      return "#10B981";
    case "output":
      return "#3B82F6";
    case "llm":
      return "#8B5CF6";
    case "image":
      return "#D946EF";
    case "video":
      return "#8B5CF6";
    case "audio":
      return "#0EA5E9";
    case "text":
      return "#F59E0B";
    case "condition":
      return "#F43F5E";
    case "math":
      return "#22D3EE";
    case "data":
      return "#FACC15";
    case "agent":
      return "#EC4899";
    case "transform":
      return "#06B6D4";
    default:
      return "#6B7280";
  }
};

const styles = (theme: Theme) => ({
  container: {
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden"
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
    backgroundColor: theme.vars.palette.background.default
  },
  headerTitle: {
    display: "flex",
    alignItems: "center",
    gap: 1
  },
  content: {
    flex: 1,
    overflow: "auto",
    padding: "12px 16px"
  },
  section: {
    marginBottom: 16
  },
  sectionTitle: {
    fontSize: "0.75rem",
    fontWeight: 600,
    color: theme.vars.palette.text.secondary,
    textTransform: "uppercase",
    letterSpacing: "1px",
    marginBottom: 8,
    display: "flex",
    alignItems: "center",
    gap: 0.5
  },
  statCard: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 12px",
    borderRadius: 8,
    backgroundColor: theme.vars.palette.action.hover,
    marginBottom: 6
  },
  statLabel: {
    fontSize: "0.85rem",
    color: theme.vars.palette.text.primary
  },
  statValue: {
    fontSize: "0.85rem",
    fontWeight: 600,
    color: theme.vars.palette.text.secondary
  },
  complexityBadge: {
    padding: "4px 12px",
    borderRadius: 12,
    fontSize: "0.75rem",
    fontWeight: 600,
    textTransform: "capitalize"
  },
  healthScore: {
    display: "flex",
    alignItems: "center",
    gap: 2,
    padding: "12px 16px",
    borderRadius: 12,
    marginBottom: 16
  },
  issueItem: {
    padding: "8px 12px",
    borderRadius: 8,
    marginBottom: 6,
    display: "flex",
    alignItems: "flex-start",
    gap: 1
  },
  nodeTypeBar: {
    display: "flex",
    alignItems: "center",
    gap: 1,
    marginBottom: 4
  },
  nodeTypeLabel: {
    fontSize: "0.75rem",
    width: 80,
    color: theme.vars.palette.text.secondary
  },
  nodeTypeCount: {
    fontSize: "0.75rem",
    width: 30,
    textAlign: "right" as const,
    color: theme.vars.palette.text.primary,
    fontWeight: 600
  },
  collapsibleSection: {
    marginBottom: 8
  },
  collapsibleHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    cursor: "pointer",
    padding: "8px 0"
  },
  factorItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "6px 0",
    fontSize: "0.8rem"
  },
  factorLabel: {
    color: theme.vars.palette.text.secondary
  },
  factorImpact: {
    fontWeight: 600
  }
});

const ComplexityIndicator: React.FC<{ level: string; score: number }> = ({
  level,
  score
}) => {
  const theme = useTheme();
  const color = getComplexityColor(
    level as "simple" | "moderate" | "complex" | "very-complex"
  );

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
      <Box sx={{ flex: 1 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            Complexity Score
          </Typography>
          <Typography variant="caption" fontWeight={600}>
            {score}
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={Math.min((score / 150) * 100, 100)}
          sx={{
            height: 6,
            borderRadius: 3,
            backgroundColor: theme.vars.palette.action.hover,
            "& .MuiLinearProgress-bar": {
              backgroundColor: color,
              borderRadius: 3
            }
          }}
        />
      </Box>
      <Chip
        label={level.replace("-", " ")}
        size="small"
        sx={{
          ...styles(theme).complexityBadge,
          backgroundColor: `${color}20`,
          color: color,
          border: `1px solid ${color}40`
        }}
      />
    </Box>
  );
};

const HealthScoreCard: React.FC<{ score: number }> = ({ score }) => {
  const theme = useTheme();
  const color = getHealthColor(score);

  let label = "Healthy";
  if (score < 80) { label = "Fair"; }
  if (score < 60) { label = "Needs Attention"; }
  if (score < 40) { label = "Poor"; }

  return (
    <Box
      sx={{
        ...styles(theme).healthScore,
        background: `linear-gradient(135deg, ${color}15 0%, ${color}08 100%)`,
        border: `1px solid ${color}30`
      }}
    >
      <Box
        sx={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `linear-gradient(135deg, ${color} 0%, ${color}CC 100%)`,
          boxShadow: `0 0 16px ${color}40`
        }}
      >
        <Typography
          variant="h6"
          sx={{ color: "#fff", fontWeight: 700, lineHeight: 1 }}
        >
          {score}
        </Typography>
      </Box>
      <Box>
        <Typography variant="body2" fontWeight={600} color={color}>
          {label}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Workflow Health Score
        </Typography>
      </Box>
    </Box>
  );
};

const IssueItem: React.FC<{
  issue: HealthIssue;
}> = ({ issue }) => {
  const theme = useTheme();

  const icon = useMemo(() => {
    switch (issue.severity) {
      case "error":
        return <ErrorIcon fontSize="small" sx={{ color: "#EF4444" }} />;
      case "warning":
        return <WarningIcon fontSize="small" sx={{ color: "#F59E0B" }} />;
      default:
        return <InfoIcon fontSize="small" sx={{ color: "#3B82F6" }} />;
    }
  }, [issue.severity]);

  const backgroundColor = useMemo(() => {
    switch (issue.severity) {
      case "error":
        return "rgba(239, 68, 68, 0.1)";
      case "warning":
        return "rgba(245, 158, 11, 0.1)";
      default:
        return "rgba(59, 130, 246, 0.1)";
    }
  }, [issue.severity]);

  const borderColor = useMemo(() => {
    switch (issue.severity) {
      case "error":
        return "rgba(239, 68, 68, 0.2)";
      case "warning":
        return "rgba(245, 158, 11, 0.2)";
      default:
        return "rgba(59, 130, 246, 0.2)";
    }
  }, [issue.severity]);

  return (
    <Box
      sx={{
        ...styles(theme).issueItem,
        backgroundColor,
        border: `1px solid ${borderColor}`
      }}
    >
      <Box sx={{ flexShrink: 0, mt: 0.25 }}>{icon}</Box>
      <Box sx={{ flex: 1 }}>
        <Typography variant="body2" color="text.primary">
          {issue.message}
        </Typography>
        {issue.suggestion && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
            💡 {issue.suggestion}
          </Typography>
        )}
      </Box>
    </Box>
  );
};

const WorkflowStatsPanelContent: React.FC<{ onClose: () => void }> = ({
  onClose
}) => {
  const theme = useTheme();
  const memoizedStyles = useMemo(() => styles(theme), [theme]);

  const activeNodeStore = useWorkflowManager((state) =>
    state.currentWorkflowId
      ? state.nodeStores[state.currentWorkflowId]
      : undefined
  );

  const nodes = useStoreWithEqualityFn(
    activeNodeStore!,
    (state) => state.nodes,
    isEqual
  );
  const edges = useStoreWithEqualityFn(
    activeNodeStore!,
    (state) => state.edges,
    isEqual
  );

  const { stats, computeStats, isComputing } = useWorkflowStatsStore();

  useEffect(() => {
    if (nodes && edges) {
      computeStats(nodes, edges);
    }
  }, [nodes, edges, computeStats]);

  const [showComplexityDetails, setShowComplexityDetails] = React.useState(false);

  if (isComputing || !stats || !nodes || !edges) {
    return (
      <Paper elevation={3} sx={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Typography color="text.secondary">Computing statistics...</Typography>
      </Paper>
    );
  }

  const nodeTypeEntries = Object.entries(stats.nodeTypes).sort(
    (a, b) => (b[1] as number) - (a[1] as number)
  );

  return (
    <Paper elevation={3} sx={memoizedStyles.container}>
      <Box sx={memoizedStyles.header}>
        <Box sx={memoizedStyles.headerTitle}>
          <TrendingUpIcon color="primary" />
          <Typography variant="h6">Workflow Stats</Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </Box>

      <Box sx={memoizedStyles.content}>
        {isComputing && <LinearProgress sx={{ mb: 2 }} />}

        <HealthScoreCard score={stats.health.score} />

        {stats.health.issues.length > 0 && (
          <Box sx={memoizedStyles.section}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Issues & Suggestions
            </Typography>
            {stats.health.issues.map((issue: HealthIssue, _index: number) => (
              <IssueItem key={_index} issue={issue} />
            ))}
          </Box>
        )}

        <Divider sx={{ my: 2 }} />

        <Box sx={memoizedStyles.section}>
          <Typography variant="subtitle2" sx={memoizedStyles.sectionTitle}>
            <GraphIcon fontSize="small" />
            Structure
          </Typography>
          <Box sx={memoizedStyles.statCard}>
            <Typography variant="body2" sx={memoizedStyles.statLabel}>
              Nodes
            </Typography>
            <Typography variant="body2" sx={memoizedStyles.statValue}>
              {stats.nodeCount}
            </Typography>
          </Box>
          <Box sx={memoizedStyles.statCard}>
            <Typography variant="body2" sx={memoizedStyles.statLabel}>
              Connections
            </Typography>
            <Typography variant="body2" sx={memoizedStyles.statValue}>
              {stats.edgeCount}
            </Typography>
          </Box>
          <Box sx={memoizedStyles.statCard}>
            <Typography variant="body2" sx={memoizedStyles.statLabel}>
              Workflow Depth
            </Typography>
            <Typography variant="body2" sx={memoizedStyles.statValue}>
              {stats.structure.depth} levels
            </Typography>
          </Box>
          <Box sx={memoizedStyles.statCard}>
            <Typography variant="body2" sx={memoizedStyles.statLabel}>
              Branch Points
            </Typography>
            <Typography variant="body2" sx={memoizedStyles.statValue}>
              {stats.structure.branches}
            </Typography>
          </Box>
        </Box>

        <Box sx={memoizedStyles.section}>
          <Typography variant="subtitle2" sx={memoizedStyles.sectionTitle}>
            <SpeedIcon fontSize="small" />
            Connectivity
          </Typography>
          <Box sx={memoizedStyles.statCard}>
            <Typography variant="body2" sx={memoizedStyles.statLabel}>
              Density
            </Typography>
            <Typography variant="body2" sx={memoizedStyles.statValue}>
              {stats.connectivity.density}%
            </Typography>
          </Box>
          <Box sx={memoizedStyles.statCard}>
            <Typography variant="body2" sx={memoizedStyles.statLabel}>
              Avg. Connections/Node
            </Typography>
            <Typography variant="body2" sx={memoizedStyles.statValue}>
              {stats.connectivity.averageConnectionsPerNode.toFixed(1)}
            </Typography>
          </Box>
          <Box sx={memoizedStyles.statCard}>
            <Typography variant="body2" sx={memoizedStyles.statLabel}>
              Disconnected
            </Typography>
            <Typography
              variant="body2"
              sx={{
                ...memoizedStyles.statValue,
                color: stats.connectivity.disconnectedNodes > 0 ? "#F59E0B" : undefined
              }}
            >
              {stats.connectivity.disconnectedNodes}
            </Typography>
          </Box>
          <Box sx={memoizedStyles.statCard}>
            <Typography variant="body2" sx={memoizedStyles.statLabel}>
              Orphaned
            </Typography>
            <Typography
              variant="body2"
              sx={{
                ...memoizedStyles.statValue,
                color: stats.connectivity.orphans > 0 ? "#F59E0B" : undefined
              }}
            >
              {stats.connectivity.orphans}
            </Typography>
          </Box>
        </Box>

        <Box sx={memoizedStyles.section}>
          <Typography variant="subtitle2" sx={memoizedStyles.sectionTitle}>
            <HealthIcon fontSize="small" />
            Complexity
          </Typography>
          <ComplexityIndicator
            level={stats.complexity.level}
            score={stats.complexity.score}
          />
          <Box sx={memoizedStyles.collapsibleSection}>
            <Box
              sx={memoizedStyles.collapsibleHeader}
              onClick={() => setShowComplexityDetails(!showComplexityDetails)}
            >
              <Typography variant="caption" color="text.secondary">
                Factors
              </Typography>
              {showComplexityDetails ? (
                <ExpandLessIcon fontSize="small" />
              ) : (
                <ExpandMoreIcon fontSize="small" />
              )}
            </Box>
            <Collapse in={showComplexityDetails}>
              {stats.complexity.factors.map((factor: ComplexityFactor, _index: number) => (
                <Box key={_index} sx={memoizedStyles.factorItem}>
                  <Typography variant="caption" sx={memoizedStyles.factorLabel}>
                    {factor.name}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      ...memoizedStyles.factorImpact,
                      color: getComplexityColor("complex")
                    }}
                  >
                    +{factor.impact}
                  </Typography>
                </Box>
              ))}
            </Collapse>
          </Box>
        </Box>

        <Divider sx={{ my: 2 }} />

        <Box sx={memoizedStyles.section}>
          <Typography variant="subtitle2" sx={memoizedStyles.sectionTitle}>
            Node Types
          </Typography>
          {nodeTypeEntries.map(([type, count]) => (
            <Box key={type} sx={memoizedStyles.nodeTypeBar}>
              <Box sx={memoizedStyles.nodeTypeLabel}>
                {NODE_TYPE_ICONS[type] || NODE_TYPE_ICONS.other}
                <Typography
                  component="span"
                  variant="caption"
                  sx={{ ml: 0.5, textTransform: "capitalize" }}
                >
                  {type}
                </Typography>
              </Box>
              <Box sx={{ flex: 1, mx: 1 }}>
                <LinearProgress
                  variant="determinate"
                  value={((count as number) / stats.nodeCount) * 100}
                  sx={{
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: theme.vars.palette.action.hover,
                    "& .MuiLinearProgress-bar": {
                      backgroundColor: getNodeTypeColor(type),
                      borderRadius: 4
                    }
                  }}
                />
              </Box>
              <Box sx={memoizedStyles.nodeTypeCount}>{count}</Box>
            </Box>
          ))}
        </Box>
      </Box>
    </Paper>
  );
};

export const WorkflowStatsPanel: React.FC<WorkflowStatsPanelProps> = ({
  onClose
}) => {
  const activeNodeStore = useWorkflowManager((state) =>
    state.currentWorkflowId
      ? state.nodeStores[state.currentWorkflowId]
      : undefined
  );

  if (!activeNodeStore) {
    return (
      <Paper elevation={3} sx={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Typography color="text.secondary">No workflow selected</Typography>
      </Paper>
    );
  }

  return (
    <NodeContext.Provider value={activeNodeStore}>
      <WorkflowStatsPanelContent onClose={onClose} />
    </NodeContext.Provider>
  );
};

export default WorkflowStatsPanel;
