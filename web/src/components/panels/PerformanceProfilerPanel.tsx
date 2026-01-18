/**
 * Performance Profiler Panel
 *
 * Visualizes workflow execution performance metrics,
 * identifies bottlenecks, and provides optimization suggestions.
 */

import React, { useMemo } from "react";
import {
  Box,
  Paper,
  Typography,
  IconButton,
  List,
  ListItem,
  Chip,
  Tooltip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Card,
  CardContent
} from "@mui/material";
import {
  Close as CloseIcon,
  Speed as SpeedIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  ExpandMore as ExpandMoreIcon,
  Timer as TimerIcon,
  Analytics as AnalyticsIcon,
  Lightbulb as LightbulbIcon
} from "@mui/icons-material";
import usePerformanceProfilerStore, { NodePerformanceMetrics } from "../../stores/PerformanceProfilerStore";
import { useTheme } from "@mui/material/styles";

interface PerformanceProfilerPanelProps {
  workflowId: string;
  workflowName: string;
  nodes: Array<{ id: string; type?: string; data?: { label?: string } }>;
  onClose: () => void;
  onNodeClick?: (nodeId: string) => void;
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  return `${(ms / 60000).toFixed(2)}m`;
};

const getPerformanceColor = (duration: number, average: number): "success" | "warning" | "error" => {
  const ratio = duration / average;
  if (ratio < 0.8) {
    return "success";
  }
  if (ratio < 1.5) {
    return "warning";
  }
  return "error";
};

const PerformanceBar: React.FC<{ value: number; max: number; color: string }> = ({ value, max, color }) => (
  <Box sx={{ width: "100%", display: "flex", alignItems: "center", gap: 1 }}>
    <Box sx={{ flex: 1, height: 8, bgcolor: "action.hover", borderRadius: 1, overflow: "hidden" }}>
      <Box
        sx={{
          width: `${Math.min((value / max) * 100, 100)}%`,
          height: "100%",
          bgcolor: color,
          transition: "width 0.3s ease"
        }}
      />
    </Box>
    <Typography variant="caption" sx={{ minWidth: 50, textAlign: "right" }}>
      {formatDuration(value)}
    </Typography>
  </Box>
);

const NodePerformanceCard: React.FC<{
  metrics: NodePerformanceMetrics;
  maxDuration: number;
  onClick?: () => void;
}> = ({ metrics, maxDuration, onClick }) => {
  const theme = useTheme();
  const color = getPerformanceColor(metrics.averageDuration, maxDuration * 0.3);

  return (
    <Card
      variant="outlined"
      sx={{ cursor: onClick ? "pointer" : "default", "&:hover": onClick ? { bgcolor: "action.hover" } : {} }}
      onClick={onClick}
    >
      <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="body2" fontWeight="medium">
              {metrics.nodeName}
            </Typography>
            <Chip
              label={metrics.nodeType?.split(".").pop() || "Node"}
              size="small"
              sx={{ height: 20, fontSize: "0.65rem" }}
            />
          </Box>
          <Chip
            icon={metrics.status === "completed" ? <CheckCircleIcon sx={{ fontSize: 14 }} /> : undefined}
            label={metrics.status}
            size="small"
            color={metrics.status === "completed" ? "success" : metrics.status === "failed" ? "error" : "default"}
            sx={{ height: 20, fontSize: "0.65rem" }}
          />
        </Box>

        <Box sx={{ display: "flex", gap: 2, mb: 1 }}>
          <Box>
            <Typography variant="caption" color="text.secondary">Avg</Typography>
            <Typography variant="body2" fontWeight="medium">{formatDuration(metrics.averageDuration)}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Min</Typography>
            <Typography variant="body2">{formatDuration(metrics.minDuration)}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Max</Typography>
            <Typography variant="body2">{formatDuration(metrics.maxDuration)}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Runs</Typography>
            <Typography variant="body2">{metrics.executionCount}</Typography>
          </Box>
        </Box>

        <PerformanceBar
          value={metrics.averageDuration}
          max={maxDuration}
          color={theme.palette[color].main}
        />
      </CardContent>
    </Card>
  );
};

const SummaryCard: React.FC<{
  title: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  subtitle?: string;
}> = ({ title, value, icon, color, subtitle }) => (
  <Card variant="outlined">
    <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
        <Box sx={{ color }}>{icon}</Box>
        <Typography variant="caption" color="text.secondary">{title}</Typography>
      </Box>
      <Typography variant="h6" fontWeight="bold">{value}</Typography>
      {subtitle && (
        <Typography variant="caption" color="text.secondary">{subtitle}</Typography>
      )}
    </CardContent>
  </Card>
);

export const PerformanceProfilerPanel: React.FC<PerformanceProfilerPanelProps> = (props) => {
  const { workflowId, workflowName, onClose } = props;
  const theme = useTheme();

  const {
    isProfiling,
    startProfiling,
    endProfiling,
    generateReport,
    clearCurrentSession
  } = usePerformanceProfilerStore();

  const report = useMemo(() => generateReport(), [generateReport]);

  const maxDuration = useMemo(() => {
    return Math.max(...report.nodes.map(n => n.averageDuration), 1000);
  }, [report]);

  const handleStartProfiling = () => {
    clearCurrentSession();
    startProfiling(workflowId, workflowName, []);
  };

  const handleStopProfiling = () => {
    endProfiling();
  };

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
          <AnalyticsIcon color="primary" />
          <Typography variant="h6">Performance Profiler</Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </Box>

      <Box sx={{ p: 1, borderBottom: 1, borderColor: "divider", display: "flex", gap: 1 }}>
        {!isProfiling ? (
          <Tooltip title="Start profiling the next workflow execution">
            <Chip
              icon={<SpeedIcon />}
              label="Start Profiling"
              onClick={handleStartProfiling}
              color="primary"
              clickable
            />
          </Tooltip>
        ) : (
          <Tooltip title="Stop profiling">
            <Chip
              icon={<TimerIcon />}
              label="Stop Profiling"
              onClick={handleStopProfiling}
              color="warning"
              clickable
            />
          </Tooltip>
        )}
        <Chip
          label={isProfiling ? "Recording..." : "Idle"}
          size="small"
          color={isProfiling ? "warning" : "default"}
        />
      </Box>

      <Box sx={{ flex: 1, overflow: "auto", p: 2 }}>
        {report.summary.totalExecutions === 0 ? (
          <Box sx={{ textAlign: "center", py: 4 }}>
            <AnalyticsIcon sx={{ fontSize: 48, color: "text.disabled", mb: 2 }} />
            <Typography color="text.secondary" gutterBottom>
              No profiling data available
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Start profiling and run a workflow to see performance metrics
            </Typography>
          </Box>
        ) : (
          <>
            <Typography variant="subtitle2" gutterBottom>
              Execution Summary
            </Typography>

            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 1, mb: 2 }}>
              <SummaryCard
                title="Total Runs"
                value={report.summary.totalExecutions.toString()}
                icon={<SpeedIcon />}
                color={theme.palette.primary.main}
              />
              <SummaryCard
                title="Avg Duration"
                value={formatDuration(report.summary.averageDuration)}
                icon={<TimerIcon />}
                color={theme.palette.info.main}
              />
              <SummaryCard
                title="Fastest"
                value={formatDuration(report.summary.fastestExecution)}
                icon={<TrendingDownIcon />}
                color={theme.palette.success.main}
              />
              <SummaryCard
                title="Success Rate"
                value={`${report.summary.successRate.toFixed(1)}%`}
                icon={<CheckCircleIcon />}
                color={report.summary.successRate >= 90 ? theme.palette.success.main : theme.palette.warning.main}
              />
            </Box>

            {report.bottlenecks.length > 0 && (
              <Accordion defaultExpanded>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <WarningIcon color="warning" fontSize="small" />
                    <Typography variant="subtitle2">
                      Bottlenecks ({report.bottlenecks.length})
                    </Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ p: 1 }}>
                  <List dense disablePadding>
                    {report.bottlenecks.map((bottleneck, index) => (
                      <ListItem
                        key={index}
                        sx={{
                          bgcolor: "rgba(211, 47, 47, 0.1)",
                          borderRadius: 1,
                          mb: 0.5
                        }}
                      >
                        <Box sx={{ flex: 1 }}>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                            <Typography variant="body2">
                              {bottleneck.nodeType?.split(".").pop() || "Node"}
                            </Typography>
                            <Chip
                              label={bottleneck.impact}
                              size="small"
                              color={bottleneck.impact === "high" ? "error" : "warning"}
                              sx={{ height: 18, fontSize: "0.6rem" }}
                            />
                          </Box>
                          <Typography variant="caption" color="text.secondary">
                            {formatDuration(bottleneck.averageDuration)} average
                          </Typography>
                        </Box>
                      </ListItem>
                    ))}
                  </List>
                </AccordionDetails>
              </Accordion>
            )}

            <Accordion defaultExpanded>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <TrendingUpIcon color="primary" fontSize="small" />
                  <Typography variant="subtitle2">
                    Node Performance ({report.nodes.length})
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails sx={{ p: 1 }}>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {report.nodes
                    .sort((a, b) => b.averageDuration - a.averageDuration)
                    .map((metrics) => (
                      <NodePerformanceCard
                        key={metrics.nodeId}
                        metrics={metrics}
                        maxDuration={maxDuration}
                      />
                    ))}
                </Box>
              </AccordionDetails>
            </Accordion>

            {report.recommendations.length > 0 && (
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <LightbulbIcon color="info" fontSize="small" />
                    <Typography variant="subtitle2">
                      Recommendations ({report.recommendations.length})
                    </Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ p: 1 }}>
                  <List dense disablePadding>
                    {report.recommendations.map((rec, index) => (
                      <ListItem key={index} sx={{ py: 0.5 }}>
                        <Typography variant="body2" color="text.secondary">
                          • {rec}
                        </Typography>
                      </ListItem>
                    ))}
                  </List>
                </AccordionDetails>
              </Accordion>
            )}
          </>
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
          Profiling {isProfiling ? "in progress" : "completed"} • {report.nodes.length} nodes tracked
        </Typography>
      </Box>
    </Paper>
  );
};

export default PerformanceProfilerPanel;
