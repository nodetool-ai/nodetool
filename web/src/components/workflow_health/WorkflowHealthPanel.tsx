/** @jsxImportSource @emotion/react */
import React, { memo, useMemo, useCallback } from "react";
import {
  Box,
  Typography,
  Alert,
  Chip,
  IconButton,
  Tooltip,
  Paper,
  Stack,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import DeleteIcon from "@mui/icons-material/Delete";
import HealthIcon from "@mui/icons-material/Favorite";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import WarningIcon from "@mui/icons-material/Warning";
import InfoIcon from "@mui/icons-material/Info";
import SpeedIcon from "@mui/icons-material/Speed";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import ScheduleIcon from "@mui/icons-material/Schedule";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import useWorkflowHealth from "../../hooks/useWorkflowHealth";
import useWorkflowHealthStore from "../../stores/WorkflowHealthStore";
import WorkflowHealthMetricCard from "./WorkflowHealthMetricCard";
import WorkflowHealthRecommendation from "./WorkflowHealthRecommendation";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

const styles = (theme: Theme) => ({
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    gap: 2,
    p: 2,
    overflow: "auto",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 2,
    pb: 2,
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
  },
  title: {
    display: "flex",
    alignItems: "center",
    gap: 1,
  },
  metricsGrid: {
    display: "grid",
    gridTemplateColumns: {
      xs: "repeat(2, 1fr)",
      sm: "repeat(3, 1fr)",
      md: "repeat(4, 1fr)",
    },
    gap: 2,
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: 1.5,
  },
  sectionTitle: {
    display: "flex",
    alignItems: "center",
    gap: 1,
    fontWeight: 600,
    color: "text.primary",
  },
  scoreCard: {
    p: 3,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
    textAlign: "center",
    borderRadius: 2,
    border: `2px solid`,
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    py: 8,
    px: 2,
    textAlign: "center",
  },
});

/**
 * WorkflowHealthPanel displays comprehensive workflow health metrics.
 *
 * Shows health score, execution statistics, performance metrics,
 * and actionable recommendations for workflow optimization.
 *
 * Accessible via keyboard shortcut (Ctrl+H) or through the workflow menu.
 *
 * @example
 * ```typescript
 * // The panel is integrated into the bottom panel system
 * <PanelBottom />
 * // Users can switch to "health" view to see this panel
 * ```
 */
const WorkflowHealthPanel: React.FC = memo(function WorkflowHealthPanel() {
  const theme = useTheme();
  const classes = styles(theme);
  const currentWorkflowId = useWorkflowManager((s) => s.currentWorkflowId);
  const clearHistory = useWorkflowHealthStore((s) => s.clearHistory);

  const {
    health,
    hasData,
    healthColor,
    formatScore,
    formatRate,
    formatDuration,
    getRecommendationsByType,
  } = useWorkflowHealth(currentWorkflowId || "");

  const handleClearHistory = useCallback(() => {
    if (currentWorkflowId) {
      clearHistory(currentWorkflowId);
    }
  }, [currentWorkflowId, clearHistory]);

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      // Navigate to the node in the editor
      // This would typically trigger a pan/zoom to the node
      console.log("Navigate to node:", nodeId);
      // TODO: Implement node navigation
    },
    []
  );

  const healthScoreColor = useMemo(() => {
    switch (healthColor) {
      case "success":
        return theme.vars.palette.success.main;
      case "warning":
        return theme.vars.palette.warning.main;
      case "error":
        return theme.vars.palette.error.main;
      default:
        return theme.vars.palette.text.secondary;
    }
  }, [healthColor, theme]);

  const healthScoreBg = useMemo(() => {
    switch (healthColor) {
      case "success":
        return theme.vars.palette.success.dark + "22";
      case "warning":
        return theme.vars.palette.warning.dark + "22";
      case "error":
        return theme.vars.palette.error.dark + "22";
      default:
        return theme.vars.palette.action.disabled;
    }
  }, [healthColor, theme]);

  if (!currentWorkflowId) {
    return (
      <Box sx={classes.container}>
        <Box sx={classes.emptyState}>
          <InfoIcon sx={{ fontSize: 48, color: "text.secondary" }} />
          <Typography variant="h6">No Workflow Selected</Typography>
          <Typography variant="body2" color="text.secondary">
            Open a workflow to view its health metrics and recommendations
          </Typography>
        </Box>
      </Box>
    );
  }

  if (!hasData) {
    return (
      <Box sx={classes.container}>
        <Box sx={classes.header}>
          <Box sx={classes.title}>
            <HealthIcon />
            <Typography variant="h6">Workflow Health</Typography>
          </Box>
          <Box
            sx={{
              display: "flex",
              gap: 1,
            }}
          >
            <Chip
              label="No Data"
              size="small"
              color="default"
              variant="outlined"
            />
          </Box>
        </Box>
        <Box sx={classes.emptyState}>
          <SpeedIcon sx={{ fontSize: 48, color: "text.secondary" }} />
          <Typography variant="h6">No Execution Data</Typography>
          <Typography variant="body2" color="text.secondary">
            Run this workflow a few times to see health metrics and optimization
            suggestions
          </Typography>
        </Box>
      </Box>
    );
  }

  if (!health) {
    return null;
  }

  const errorRecommendations = getRecommendationsByType("error");
  const warningRecommendations = getRecommendationsByType("warning");
  const infoRecommendations = getRecommendationsByType("info");
  const successRecommendations = getRecommendationsByType("success");

  return (
    <Box sx={classes.container}>
      {/* Header */}
      <Box sx={classes.header}>
        <Box sx={classes.title}>
          <HealthIcon />
          <Typography variant="h6">Workflow Health</Typography>
        </Box>
        <Box
          sx={{
            display: "flex",
            gap: 1,
            alignItems: "center",
          }}
        >
          <Chip
            label={healthColor === "success" ? "Healthy" : healthColor === "warning" ? "Warning" : "Critical"}
            size="small"
            color={healthColor === "default" ? "default" : healthColor}
            variant="filled"
          />
          <Tooltip
            enterDelay={TOOLTIP_ENTER_DELAY}
            title="Clear health history"
          >
            <IconButton
              size="small"
              onClick={handleClearHistory}
              aria-label="Clear health history"
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Health Score */}
      <Paper
        sx={{
          ...classes.scoreCard,
          borderColor: healthScoreColor,
          backgroundColor: healthScoreBg,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          Health Score
        </Typography>
        <Typography
          variant="h2"
          sx={{
            color: healthScoreColor,
            fontWeight: 700,
            fontSize: "3rem",
          }}
        >
          {formatScore(health.score)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Based on {health.totalExecutions} execution
          {health.totalExecutions !== 1 ? "s" : ""}
        </Typography>
      </Paper>

      {/* Metrics Grid */}
      <Box sx={classes.section}>
        <Typography sx={classes.sectionTitle}>Execution Statistics</Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(3, 1fr)", md: "repeat(4, 1fr)" }, gap: 2 }}>
          <Box sx={{ gridColumn: { xs: "span 1", sm: "span 1", md: "span 1" } }}>
            <WorkflowHealthMetricCard
              title="Success Rate"
              value={formatRate(health.successRate)}
              subtitle={`${health.successfulExecutions} of ${health.totalExecutions} successful`}
              icon={<CheckCircleIcon />}
              color={health.successRate >= 0.9 ? "success" : health.successRate >= 0.7 ? "warning" : "error"}
            />
          </Box>
          <Box sx={{ gridColumn: { xs: "span 1", sm: "span 1", md: "span 1" } }}>
            <WorkflowHealthMetricCard
              title="Average Time"
              value={formatDuration(health.averageExecutionTime)}
              subtitle="Per execution"
              icon={<ScheduleIcon />}
              color="info"
            />
          </Box>
          <Box sx={{ gridColumn: { xs: "span 1", sm: "span 1", md: "span 1" } }}>
            <WorkflowHealthMetricCard
              title="Fastest Run"
              value={formatDuration(health.fastestExecution)}
              subtitle="Best performance"
              icon={<TrendingUpIcon />}
              color="success"
            />
          </Box>
          <Box sx={{ gridColumn: { xs: "span 1", sm: "span 1", md: "span 1" } }}>
            <WorkflowHealthMetricCard
              title="Slowest Run"
              value={formatDuration(health.slowestExecution)}
              subtitle="Worst performance"
              icon={<SpeedIcon />}
              color="warning"
            />
          </Box>
        </Box>
      </Box>

      {/* Node Statistics */}
      {Object.keys(health.nodeStatistics).length > 0 && (
        <Box sx={classes.section}>
          <Typography sx={classes.sectionTitle}>Node Performance</Typography>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(3, 1fr)", md: "repeat(4, 1fr)" }, gap: 2 }}>
            {Object.values(health.nodeStatistics)
              .sort((a, b) => b.averageDuration - a.averageDuration)
              .slice(0, 4)
              .map((node) => (
                <Box sx={{ gridColumn: { xs: "span 1", sm: "span 1", md: "span 1" } }} key={node.nodeId}>
                  <WorkflowHealthMetricCard
                    title={node.nodeId}
                    value={formatDuration(node.averageDuration)}
                    subtitle={`${node.executionCount} executions • ${formatRate(1 - node.failureRate)} success`}
                    icon={<SpeedIcon />}
                    color={node.failureRate > 0.2 ? "error" : node.failureRate > 0.1 ? "warning" : "default"}
                  />
                </Box>
              ))}
          </Box>
        </Box>
      )}

      {/* Recommendations */}
      <Box sx={classes.section}>
        <Typography sx={classes.sectionTitle}>Recommendations</Typography>
        <Stack spacing={1}>
          {errorRecommendations.length > 0 &&
            errorRecommendations.map((rec, index) => (
              <WorkflowHealthRecommendation
                key={`error-${index}`}
                recommendation={rec}
                onNodeClick={handleNodeClick}
              />
            ))}
          {warningRecommendations.length > 0 &&
            warningRecommendations.map((rec, index) => (
              <WorkflowHealthRecommendation
                key={`warning-${index}`}
                recommendation={rec}
                onNodeClick={handleNodeClick}
              />
            ))}
          {infoRecommendations.length > 0 &&
            infoRecommendations.map((rec, index) => (
              <WorkflowHealthRecommendation
                key={`info-${index}`}
                recommendation={rec}
                onNodeClick={handleNodeClick}
              />
            ))}
          {successRecommendations.length > 0 &&
            successRecommendations.map((rec, index) => (
              <WorkflowHealthRecommendation
                key={`success-${index}`}
                recommendation={rec}
                onNodeClick={handleNodeClick}
              />
            ))}
          {errorRecommendations.length === 0 &&
            warningRecommendations.length === 0 &&
            infoRecommendations.length === 0 &&
            successRecommendations.length === 0 && (
              <Alert severity="info">
                <Typography variant="body2">
                  No recommendations available. Run the workflow more times to get insights.
                </Typography>
              </Alert>
            )}
        </Stack>
      </Box>
    </Box>
  );
});

export default WorkflowHealthPanel;
