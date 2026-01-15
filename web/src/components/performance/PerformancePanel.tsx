import React, { useMemo } from "react";
import {
  Box,
  Paper,
  Typography,
  List,
  ListItem,
  Chip,
  LinearProgress,
  Tooltip,
  IconButton,
  Collapse
} from "@mui/material";
import {
  ExpandMore,
  ExpandLess,
  Speed,
  Warning,
  CheckCircle,
  Schedule,
  TrendingDown
} from "@mui/icons-material";
import usePerformanceProfilerStore, {
  NodePerformanceData
} from "../../stores/PerformanceProfilerStore";
import { useTheme, Theme } from "@mui/material/styles";

interface PerformancePanelProps {
  workflowId: string;
  nodes: { id: string; type: string; data: Record<string, any> }[];
  onNodeClick?: (nodeId: string) => void;
  onClose?: () => void;
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    const seconds = (ms / 1000).toFixed(1);
    return `${seconds}s`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  }
};

const formatFileSize = (bytes: number | undefined): string => {
  if (bytes === undefined) return "-";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

const getStatusColorHelper = (
  status: string,
  hasError: boolean,
  theme: Theme
): string => {
  if (hasError) {
    return theme.palette.error.main;
  }
  if (status === "completed" || status === "success") {
    return theme.palette.success.main;
  }
  if (status === "running") {
    return theme.palette.info.main;
  }
  if (status === "pending") {
    return theme.palette.grey[500];
  }
  return theme.palette.grey[600];
};

const StatusChip: React.FC<{ status: string; hasError: boolean }> = ({
  status,
  hasError
}) => {
  const theme = useTheme();
  const color = getStatusColorHelper(status, hasError, theme);

  const getIcon = () => {
    if (hasError) {
      return <Warning sx={{ fontSize: 14 }} />;
    }
    if (status === "completed" || status === "success") {
      return <CheckCircle sx={{ fontSize: 14 }} />;
    }
    if (status === "running") {
      return <Schedule sx={{ fontSize: 14 }} />;
    }
    return null;
  };

  return (
    <Chip
      icon={getIcon() || undefined}
      label={status}
      size="small"
      sx={{
        backgroundColor: `${color}20`,
        color,
        fontWeight: 500,
        fontSize: "0.7rem",
        height: 20,
        "& .MuiChip-icon": {
          color
        }
      }}
    />
  );
};

const NodePerformanceItem: React.FC<{
  node: NodePerformanceData;
  maxDuration: number;
  onClick?: () => void;
}> = ({ node, maxDuration, onClick }) => {
  const theme = useTheme();
  const duration = node.duration || 0;
  const progress = maxDuration > 0 ? (duration / maxDuration) * 100 : 0;

  return (
    <ListItem
      component="div"
      onClick={onClick}
      sx={{
        cursor: onClick ? "pointer" : "default",
        borderRadius: 1,
        mb: 0.5,
        "&:hover": onClick ? { backgroundColor: "action.hover" } : {},
        py: 1
      }}
    >
      <Box sx={{ width: "100%" }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="body2" fontWeight={500} noWrap sx={{ maxWidth: 120 }}>
              {node.nodeLabel}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {node.nodeType}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            {node.duration !== undefined && (
              <Typography variant="body2" fontWeight={600} color="text.primary">
                {formatDuration(node.duration)}
              </Typography>
            )}
            <StatusChip status={node.status} hasError={node.hasError} />
          </Box>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <LinearProgress
            variant="determinate"
            value={progress}
            sx={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              backgroundColor: "action.hover",
              "& .MuiLinearProgress-bar": {
                backgroundColor: node.hasError
                  ? theme.palette.error.main
                  : theme.palette.primary.main,
                borderRadius: 2
              }
            }}
          />
          {node.resultSize !== undefined && (
            <Tooltip title="Result size">
              <Typography variant="caption" color="text.secondary">
                {formatFileSize(node.resultSize)}
              </Typography>
            </Tooltip>
          )}
        </Box>
        {node.hasError && node.errorMessage && (
          <Typography
            variant="caption"
            color="error"
            sx={{
              display: "block",
              mt: 0.5,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}
          >
            {node.errorMessage}
          </Typography>
        )}
      </Box>
    </ListItem>
  );
};

export const PerformancePanel: React.FC<PerformancePanelProps> = ({
  workflowId,
  nodes,
  onNodeClick,
  onClose
}) => {
  const theme = useTheme();
  const [expanded, setExpanded] = React.useState(true);
  const [sortBy, setSortBy] = React.useState<"duration" | "status" | "label">("duration");

  const profile = usePerformanceProfilerStore((state) =>
    state.analyzeWorkflow(workflowId, nodes)
  );

  const sortedNodes = useMemo(() => {
    if (!profile) return [];

    const nodes = [...profile.nodes];

    switch (sortBy) {
      case "duration":
        return nodes.sort((a, b) => (b.duration || 0) - (a.duration || 0));
      case "status":
        return nodes.sort((a, b) => {
          if (a.hasError !== b.hasError) return a.hasError ? -1 : 1;
          return a.status.localeCompare(b.status);
        });
      case "label":
        return nodes.sort((a, b) => a.nodeLabel.localeCompare(b.nodeLabel));
      default:
        return nodes;
    }
  }, [profile, sortBy]);

  const maxDuration = useMemo(() => {
    if (!profile) return 1;
    return Math.max(...profile.nodes.map((n) => n.duration || 0), 1);
  }, [profile]);

  const completionRate = useMemo(() => {
    if (!profile || profile.nodeCount === 0) return 0;
    return (profile.completedCount / profile.nodeCount) * 100;
  }, [profile]);

  const errorRate = useMemo(() => {
    if (!profile || profile.nodeCount === 0) return 0;
    return (profile.errorCount / profile.nodeCount) * 100;
  }, [profile]);

  if (!profile) {
    return (
      <Paper
        sx={{
          p: 2,
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "background.paper"
        }}
      >
        <Typography color="text.secondary">
          Run the workflow to see performance data
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "background.paper",
        overflow: "hidden"
      }}
    >
      <Box
        sx={{
          p: 1.5,
          borderBottom: 1,
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Speed color="primary" />
          <Typography variant="subtitle1" fontWeight={600}>
            Performance
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <IconButton size="small" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ExpandLess /> : <ExpandMore />}
          </IconButton>
        </Box>
      </Box>

      <Collapse in={expanded}>
        <Box sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}>
          <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Total Time
              </Typography>
              <Typography variant="h6" fontWeight={600}>
                {formatDuration(profile.totalDuration)}
              </Typography>
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Completion
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography variant="h6" fontWeight={600}>
                  {profile.completedCount}/{profile.nodeCount}
                </Typography>
                <Chip
                  label={`${completionRate.toFixed(0)}%`}
                  size="small"
                  color={completionRate === 100 ? "success" : "default"}
                  sx={{ height: 20, fontSize: "0.7rem" }}
                />
              </Box>
            </Box>
            {profile.errorCount > 0 && (
              <Box sx={{ flex: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  Errors
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Warning color="error" />
                  <Typography variant="h6" fontWeight={600} color="error">
                    {profile.errorCount}
                  </Typography>
                </Box>
              </Box>
            )}
          </Box>
        </Box>

        <Box sx={{ px: 2, py: 1, borderBottom: 1, borderColor: "divider" }}>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
            Bottlenecks
          </Typography>
          {profile.bottlenecks.length > 0 ? (
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
              {profile.bottlenecks.slice(0, 3).map((node) => (
                <Chip
                  key={node.nodeId}
                  icon={<TrendingDown />}
                  label={`${node.nodeLabel}: ${formatDuration(node.duration || 0)}`}
                  size="small"
                  onClick={() => onNodeClick?.(node.nodeId)}
                  sx={{
                    backgroundColor: `${theme.palette.warning.main}15`,
                    "&:hover": {
                      backgroundColor: `${theme.palette.warning.main}25`
                    }
                  }}
                />
              ))}
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No bottlenecks detected
            </Typography>
          )}
        </Box>

        <Box sx={{ px: 2, py: 1, borderBottom: 1, borderColor: "divider" }}>
          <Box sx={{ display: "flex", gap: 1 }}>
            {(["duration", "status", "label"] as const).map((key) => (
              <Chip
                key={key}
                label={key.charAt(0).toUpperCase() + key.slice(1)}
                size="small"
                variant={sortBy === key ? "filled" : "outlined"}
                onClick={() => setSortBy(key)}
                sx={{ cursor: "pointer" }}
              />
            ))}
          </Box>
        </Box>

        <List sx={{ flex: 1, overflow: "auto", p: 0 }}>
          {sortedNodes.map((node) => (
            <NodePerformanceItem
              key={node.nodeId}
              node={node}
              maxDuration={maxDuration}
              onClick={() => onNodeClick?.(node.nodeId)}
            />
          ))}
        </List>
      </Collapse>
    </Paper>
  );
};

export default PerformancePanel;
