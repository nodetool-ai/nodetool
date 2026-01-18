/**
 * BottleneckAnalysis - Analyzes and displays workflow performance bottlenecks
 *
 * Shows:
 * - Ranked list of slowest nodes
 * - Severity indicators (low/medium/high/critical)
 * - Actionable recommendations for optimization
 */

import React from "react";
import {
  Box,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Chip,
  LinearProgress,
  Tooltip,
  IconButton
} from "@mui/material";
import {
  WarningAmber as WarningIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  CheckCircle as CheckIcon,
  OpenInNew as OpenIcon
} from "@mui/icons-material";
import useWorkflowProfilerStore from "../../stores/WorkflowProfilerStore";

interface BottleneckAnalysisProps {
  workflowId: string;
  sessionId?: string;
  onNodeSelect?: (nodeId: string) => void;
}

const BottleneckAnalysis: React.FC<BottleneckAnalysisProps> = ({
  workflowId,
  sessionId,
  onNodeSelect
}) => {
  const getSession = useWorkflowProfilerStore((state) => state.getSession);
  const getStatistics = useWorkflowProfilerStore((state) => state.getStatistics);

  const session = sessionId
    ? getSession(workflowId, sessionId)
    : undefined;
  const latestSession = !sessionId ? getSession(workflowId, "") : undefined;
  const activeSession = session || latestSession;

  const stats = sessionId
    ? getStatistics(workflowId, sessionId)
    : getStatistics(workflowId, latestSession?.id || "");

  if (!activeSession) {
    return (
      <Paper sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          No profiling data available. Run a workflow to see bottleneck analysis.
        </Typography>
      </Paper>
    );
  }

  const bottlenecks = activeSession.bottlenecks;

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "critical":
        return <ErrorIcon sx={{ color: "error.main" }} />;
      case "high":
        return <WarningIcon sx={{ color: "warning.main" }} />;
      case "medium":
        return <InfoIcon sx={{ color: "info.main" }} />;
      default:
        return <CheckIcon sx={{ color: "success.main" }} />;
    }
  };

  const getSeverityColor = (severity: string): "error" | "warning" | "info" | "success" => {
    switch (severity) {
      case "critical":
        return "error";
      case "high":
        return "warning";
      case "medium":
        return "info";
      default:
        return "success";
    }
  };

  const formatDuration = (ms: number): string => {
    if (ms < 1000) {return `${Math.round(ms)}ms`;}
    if (ms < 60000) {return `${(ms / 1000).toFixed(1)}s`;}
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>
          Performance Summary
        </Typography>

        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Total Duration
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              {formatDuration(stats.totalDuration)}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Nodes Executed
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              {stats.completedNodes} / {stats.nodeCount}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Avg Node Time
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              {formatDuration(stats.avgNodeTime)}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Max Node Time
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              {formatDuration(stats.maxNodeTime)}
            </Typography>
          </Box>
        </Box>

        {stats.parallelizationRatio > 0 && (
          <Box sx={{ mt: 2 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
              <Typography variant="caption" color="text.secondary">
                Parallelization Efficiency
              </Typography>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>
                {Math.round(stats.parallelizationRatio * 100)}%
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={stats.parallelizationRatio * 100}
              sx={{ height: 6, borderRadius: 3 }}
            />
          </Box>
        )}
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
          Bottlenecks ({bottlenecks.length})
        </Typography>

        {bottlenecks.length === 0 ? (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "success.main" }}>
            <CheckIcon fontSize="small" />
            <Typography variant="body2">
              No significant bottlenecks detected. Workflow is well-optimized!
            </Typography>
          </Box>
        ) : (
          <List dense sx={{ py: 0 }}>
            {bottlenecks.map((bottleneck, index) => (
              <ListItem
                key={bottleneck.nodeId}
                sx={{
                  px: 1,
                  py: 1,
                  borderRadius: 1,
                  mb: 0.5,
                  backgroundColor: "action.hover"
                }}
                secondaryAction={
                  onNodeSelect && (
                    <Tooltip title="Focus on node">
                      <IconButton
                        edge="end"
                        size="small"
                        onClick={() => onNodeSelect(bottleneck.nodeId)}
                      >
                        <OpenIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )
                }
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  {getSeverityIcon(bottleneck.severity)}
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        Node {index + 1}
                      </Typography>
                      <Chip
                        label={bottleneck.severity}
                        size="small"
                        color={getSeverityColor(bottleneck.severity)}
                        sx={{ height: 20, fontSize: "0.65rem" }}
                      />
                    </Box>
                  }
                  secondary={
                    <Box sx={{ mt: 0.5 }}>
                      <Typography variant="caption" color="text.secondary">
                        {bottleneck.recommendation}
                      </Typography>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.25 }}>
                        <LinearProgress
                          variant="determinate"
                          value={Math.min(bottleneck.percentage, 100)}
                          sx={{
                            flex: 1,
                            height: 4,
                            borderRadius: 2,
                            backgroundColor: "action.hoverBackground"
                          }}
                        />
                        <Typography variant="caption" sx={{ fontWeight: 600, minWidth: 45 }}>
                          {formatDuration(bottleneck.duration)} ({bottleneck.percentage.toFixed(1)}%)
                        </Typography>
                      </Box>
                    </Box>
                  }
                />
              </ListItem>
            ))}
          </List>
        )}
      </Paper>
    </Box>
  );
};

export default BottleneckAnalysis;
