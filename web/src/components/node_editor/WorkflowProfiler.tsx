import { memo, useCallback, useMemo, useState } from "react";
import {
  Box,
  Paper,
  Typography,
  Button,
  LinearProgress,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Collapse,
  IconButton,
  Tooltip,
  Divider,
  Alert
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import {
  ExpandMore,
  ExpandLess,
  Speed,
  Timeline,
  Warning,
  Lightbulb,
  TrendingDown,
  TrendingUp,
  CallSplit
} from "@mui/icons-material";
import useWorkflowProfilerStore, {
  NodePerformanceMetrics,
  generateAndStoreReport
} from "../../stores/WorkflowProfilerStore";
import useExecutionTimeStore from "../../stores/ExecutionTimeStore";
import { Node } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { Edge } from "@xyflow/react";

interface WorkflowProfilerProps {
  workflowId: string;
  nodes: Node<NodeData>[];
  edges: Edge[];
  onNodeClick?: (nodeId: string) => void;
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    const remainderMs = ms % 1000;
    if (remainderMs === 0) {
      return `${seconds}s`;
    }
    return `${seconds}s ${remainderMs}ms`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainderSeconds = seconds % 60;
  if (remainderSeconds === 0) {
    return `${minutes}m`;
  }
  return `${minutes}m ${remainderSeconds}s`;
};

const formatPercentage = (value: number): string => {
  return `${value.toFixed(1)}%`;
};

const NodeMetricsItem = memo(
  ({
    metric,
    onClick,
    isSelected
  }: {
    metric: NodePerformanceMetrics;
    onClick?: () => void;
    isSelected?: boolean;
  }) => {
    const theme = useTheme();
    const [expanded, setExpanded] = useState(false);

    const hasDetails =
      metric.nodeType.includes("Model") ||
      metric.nodeType.includes("LLM") ||
      metric.nodeType.includes("Image") ||
      metric.nodeType.includes("Audio");

    const color = metric.isBottleneck
      ? theme.palette.error.main
      : metric.duration
        ? theme.palette.primary.main
        : theme.palette.text.secondary;

    return (
      <ListItem
        sx={{
          px: 1,
          py: 0.5,
          cursor: onClick ? "pointer" : "default",
          backgroundColor: isSelected
            ? theme.vars.palette.action.selected
            : "transparent",
          "&:hover": onClick
            ? { backgroundColor: theme.vars.palette.action.hover }
            : {},
          borderRadius: 1,
          mb: 0.5
        }}
        onClick={onClick}
        secondaryAction={
          hasDetails ? (
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
            >
              <ExpandMore
                sx={{
                  transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.2s"
                }}
              />
            </IconButton>
          ) : undefined
        }
      >
        <ListItemIcon sx={{ minWidth: 32 }}>
          {metric.isBottleneck ? (
            <Warning sx={{ fontSize: 18, color: theme.palette.error.main }} />
          ) : metric.duration ? (
            <Timeline sx={{ fontSize: 18, color }} />
          ) : (
            <Speed sx={{ fontSize: 18, color: theme.palette.text.disabled }} />
          )}
        </ListItemIcon>
        <ListItemText
          primary={
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: metric.isBottleneck ? 600 : 400,
                  maxWidth: 140,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap"
                }}
              >
                {metric.nodeLabel}
              </Typography>
              {metric.duration && (
                <Chip
                  label={formatDuration(metric.duration)}
                  size="small"
                  sx={{
                    height: 20,
                    fontSize: "0.65rem",
                    backgroundColor: `${color}20`,
                    color
                  }}
                />
              )}
            </Box>
          }
          secondary={
            metric.duration
              ? `${formatPercentage(metric.percentageOfTotal)} of total`
              : "No execution data"
          }
          primaryTypographyProps={{
            variant: "body2",
            noWrap: true
          }}
          secondaryTypographyProps={{
            variant: "caption"
          }}
        />
        {metric.duration && (
          <Box sx={{ width: 60, ml: 1 }}>
            <LinearProgress
              variant="determinate"
              value={Math.min(metric.percentageOfTotal, 100)}
              sx={{
                height: 6,
                borderRadius: 3,
                backgroundColor: `${color}20`,
                "& .MuiLinearProgress-bar": {
                  backgroundColor: color,
                  borderRadius: 3
                }
              }}
            />
          </Box>
        )}
        <Collapse in={expanded}>
          <Box sx={{ mt: 1, pl: 4 }}>
            <Typography variant="caption" color="text.secondary">
              Type: {metric.nodeType.split(".").pop()}
            </Typography>
            {metric.nodeType.includes("Model") && (
              <Typography variant="caption" display="block" color="text.secondary">
                Optimization: Consider using a smaller/faster model variant
              </Typography>
            )}
            {metric.nodeType.includes("Image") && (
              <Typography variant="caption" display="block" color="text.secondary">
                Optimization: Reduce image dimensions or use compression
              </Typography>
            )}
          </Box>
        </Collapse>
      </ListItem>
    );
  }
);

NodeMetricsItem.displayName = "NodeMetricsItem";

const WorkflowProfiler: React.FC<WorkflowProfilerProps> = ({
  workflowId,
  nodes,
  edges,
  onNodeClick
}) => {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const report = useWorkflowProfilerStore((state) =>
    state.getReport(workflowId)
  );
  const getDuration = useExecutionTimeStore((state) => state.getDuration);

  const executedNodesCount = useMemo(() => {
    return nodes.filter((n) => getDuration(workflowId, n.id) !== undefined).length;
  }, [nodes, workflowId, getDuration]);

  const handleAnalyze = useCallback(() => {
    generateAndStoreReport(workflowId, nodes, edges);
  }, [workflowId, nodes, edges]);

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      setSelectedNodeId(nodeId);
      onNodeClick?.(nodeId);
    },
    [onNodeClick]
  );

  const hasExecutionData = executedNodesCount > 0;

  return (
    <Paper
      sx={{
        backgroundColor: theme.vars.palette.Paper.paper,
        borderRadius: 2,
        border: `1px solid ${theme.vars.palette.divider}`,
        overflow: "hidden"
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 1.5,
          py: 1,
          borderBottom:
            expanded && hasExecutionData
              ? `1px solid ${theme.vars.palette.divider}`
              : "none",
          cursor: "pointer",
          userSelect: "none"
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Speed sx={{ color: theme.palette.primary.main }} />
          <Typography variant="subtitle2" fontWeight={600}>
            Performance Profiler
          </Typography>
          {report && (
            <Chip
              label={`${report.executedNodes}/${report.totalNodes} runs`}
              size="small"
              sx={{
                height: 20,
                fontSize: "0.65rem",
                backgroundColor: hasExecutionData
                  ? `${theme.palette.success.main}20`
                  : `${theme.palette.warning.main}20`,
                color: hasExecutionData
                  ? theme.palette.success.main
                  : theme.palette.warning.main
              }}
            />
          )}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          {!hasExecutionData && (
            <Tooltip title="Run workflow to collect performance data">
              <Chip
                label="No data"
                size="small"
                sx={{
                  height: 20,
                  fontSize: "0.65rem",
                  backgroundColor: `${theme.palette.warning.main}20`,
                  color: theme.palette.warning.main
                }}
              />
            </Tooltip>
          )}
          <IconButton size="small">
            {expanded ? <ExpandLess /> : <ExpandMore />}
          </IconButton>
        </Box>
      </Box>

      <Collapse in={expanded}>
        <Box sx={{ p: 1.5 }}>
          {!report ? (
            <Box sx={{ textAlign: "center", py: 2 }}>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mb: 1.5 }}
              >
                {hasExecutionData
                  ? "Click to analyze workflow performance"
                  : "Run your workflow first to collect performance data"}
              </Typography>
              <Button
                variant="outlined"
                size="small"
                onClick={handleAnalyze}
                disabled={!hasExecutionData}
                startIcon={<Timeline />}
              >
                {hasExecutionData ? "Analyze Performance" : "Collect Data"}
              </Button>
            </Box>
          ) : (
            <>
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, mb: 2 }}>
                <Box
                  sx={{
                    p: 1,
                    backgroundColor: `${theme.palette.primary.main}10`,
                    borderRadius: 1
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.5 }}>
                    <TrendingUp sx={{ fontSize: 14, color: theme.palette.primary.main }} />
                    <Typography variant="caption" color="text.secondary">
                      Total Time
                    </Typography>
                  </Box>
                  <Typography variant="body1" fontWeight={600}>
                    {formatDuration(report.totalDuration)}
                  </Typography>
                </Box>

                <Box
                  sx={{
                    p: 1,
                    backgroundColor:
                      report.efficiency >= 70
                        ? `${theme.palette.success.main}10`
                        : report.efficiency >= 40
                          ? `${theme.palette.warning.main}10`
                          : `${theme.palette.error.main}10`,
                    borderRadius: 1
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.5 }}>
                    <Speed sx={{ fontSize: 14, color: theme.palette.text.secondary }} />
                    <Typography variant="caption" color="text.secondary">
                      Efficiency
                    </Typography>
                  </Box>
                  <Typography
                    variant="body1"
                    fontWeight={600}
                    sx={{
                      color:
                        report.efficiency >= 70
                          ? theme.palette.success.main
                          : report.efficiency >= 40
                            ? theme.palette.warning.main
                            : theme.palette.error.main
                    }}
                  >
                    {formatPercentage(report.efficiency)}
                  </Typography>
                </Box>

                <Box
                  sx={{
                    p: 1,
                    backgroundColor: `${theme.vars.palette.background.default}50`,
                    borderRadius: 1
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.5 }}>
                    <Timeline sx={{ fontSize: 14, color: theme.palette.text.secondary }} />
                    <Typography variant="caption" color="text.secondary">
                      Graph Depth
                    </Typography>
                  </Box>
                  <Typography variant="body1" fontWeight={600}>
                    {report.graphDepth} layers
                  </Typography>
                </Box>

                <Box
                  sx={{
                    p: 1,
                    backgroundColor: `${theme.vars.palette.background.default}50`,
                    borderRadius: 1
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.5 }}>
                    <CallSplit sx={{ fontSize: 14, color: theme.palette.text.secondary }} />
                    <Typography variant="caption" color="text.secondary">
                      Parallel Paths
                    </Typography>
                  </Box>
                  <Typography variant="body1" fontWeight={600}>
                    {report.parallelizablePaths}
                  </Typography>
                </Box>
              </Box>

              {report.suggestions.length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 1 }}
                  >
                    <Lightbulb sx={{ fontSize: 14 }} />
                    Optimization Suggestions
                  </Typography>
                  {report.suggestions.map((suggestion, index) => (
                    <Alert
                      key={index}
                      severity="info"
                      icon={false}
                      sx={{
                        py: 0.5,
                        mb: 0.5,
                        fontSize: "0.75rem",
                        "& .MuiAlert-message": { padding: 0 }
                      }}
                    >
                      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 0.5 }}>
                        <Lightbulb
                          sx={{ fontSize: 14, mt: 0.25, color: theme.palette.info.main }}
                        />
                        <Typography variant="body2">{suggestion}</Typography>
                      </Box>
                    </Alert>
                  ))}
                </Box>
              )}

              {report.bottlenecks.length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 1 }}
                  >
                    <TrendingDown sx={{ fontSize: 14, color: theme.palette.error.main }} />
                    Bottlenecks (greater than 10% of total)
                  </Typography>
                  {report.bottlenecks.map((bottleneck) => (
                    <NodeMetricsItem
                      key={bottleneck.nodeId}
                      metric={bottleneck}
                      onClick={() => handleNodeClick(bottleneck.nodeId)}
                      isSelected={selectedNodeId === bottleneck.nodeId}
                    />
                  ))}
                </Box>
              )}

              <Divider sx={{ my: 1.5 }} />

              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 1 }}
              >
                <Timeline sx={{ fontSize: 14 }} />
                All Nodes by Execution Time
              </Typography>
              <List dense sx={{ maxHeight: 200, overflow: "auto" }}>
                {report.nodeMetrics.map((metric) => (
                  <NodeMetricsItem
                    key={metric.nodeId}
                    metric={metric}
                    onClick={
                      metric.duration
                        ? () => handleNodeClick(metric.nodeId)
                        : undefined
                    }
                    isSelected={selectedNodeId === metric.nodeId}
                  />
                ))}
              </List>
            </>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
};

WorkflowProfiler.displayName = "WorkflowProfiler";

export default memo(WorkflowProfiler);
