/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Box,
  Typography,
  Button,
  LinearProgress,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tooltip,
  Paper,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SpeedIcon from "@mui/icons-material/Speed";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import MemoryIcon from "@mui/icons-material/Memory";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import LightbulbIcon from "@mui/icons-material/Lightbulb";
import RefreshIcon from "@mui/icons-material/Refresh";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import { memo } from "react";
import { Edge } from "@xyflow/react";
import useWorkflowProfilerStore from "../../stores/WorkflowProfilerStore";
import { getComplexityLevel, type BottleneckInfo } from "../../core/workflowProfiler";
import { useNodes } from "../../contexts/NodeContext";

const profilerStyles = {
  container: (theme: Theme) =>
    css({
      padding: theme.spacing(2),
      minHeight: 200,
      maxHeight: "calc(100vh - 200px)",
      overflow: "auto",
    }),
  header: (theme: Theme) =>
    css({
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: theme.spacing(2),
    }),
  title: (theme: Theme) =>
    css({
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1),
      fontWeight: 600,
    }),
  statsGrid: (theme: Theme) =>
    css({
      display: "grid",
      gridTemplateColumns: "repeat(2, 1fr)",
      gap: theme.spacing(1.5),
      marginBottom: theme.spacing(2),
    }),
  statCard: (theme: Theme) =>
    css({
      padding: theme.spacing(1.5),
      backgroundColor: theme.vars.palette.background.default,
      borderRadius: theme.shape.borderRadius,
      border: `1px solid ${theme.vars.palette.divider}`,
    }),
  statValue: (theme: Theme) =>
    css({
      fontSize: "1.5rem",
      fontWeight: 700,
      color: theme.vars.palette.primary.main,
    }),
  statLabel: (theme: Theme) =>
    css({
      fontSize: "0.75rem",
      color: theme.vars.palette.text.secondary,
      textTransform: "uppercase",
      letterSpacing: "0.5px",
    }),
  complexityBar: (theme: Theme) =>
    css({
      marginTop: theme.spacing(1),
    }),
  sectionTitle: (theme: Theme) =>
    css({
      fontSize: "0.875rem",
      fontWeight: 600,
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(0.5),
      marginBottom: theme.spacing(1),
    }),
  bottleneckItem: (theme: Theme) =>
    css({
      padding: theme.spacing(1),
      marginBottom: theme.spacing(1),
      borderRadius: theme.shape.borderRadius,
      borderLeft: `4px solid ${theme.vars.palette.success.main}`,
      "&.low": {
        borderLeftColor: theme.vars.palette.success.main,
        backgroundColor: theme.vars.palette.success.lighter,
      },
      "&.medium": {
        borderLeftColor: theme.vars.palette.warning.main,
        backgroundColor: theme.vars.palette.warning.lighter,
      },
      "&.high": {
        borderLeftColor: theme.vars.palette.error.main,
        backgroundColor: theme.vars.palette.error.lighter,
      },
    }),
  recommendationItem: (theme: Theme) =>
    css({
      display: "flex",
      alignItems: "flex-start",
      gap: theme.spacing(1),
      padding: theme.spacing(1),
      marginBottom: theme.spacing(0.5),
      backgroundColor: theme.vars.palette.info.lighter,
      borderRadius: theme.shape.borderRadius,
      fontSize: "0.875rem",
    }),
  nodeTypeBreakdown: (theme: Theme) =>
    css({
      display: "flex",
      flexWrap: "wrap",
      gap: theme.spacing(0.5),
    }),
  metricsTable: (theme: Theme) =>
    css({
      width: "100%",
      fontSize: "0.8rem",
      "& td": {
        padding: theme.spacing(0.5),
        borderBottom: `1px solid ${theme.vars.palette.divider}`,
      },
      "& tr:last-child td": {
        borderBottom: "none",
      },
    }),
  emptyState: (theme: Theme) =>
    css({
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: theme.spacing(4),
      textAlign: "center",
      color: theme.vars.palette.text.secondary,
    }),
};

interface StatCardProps {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  theme: Theme;
}

const StatCard: React.FC<StatCardProps> = ({ icon, value, label, theme }) => (
  <Box css={profilerStyles.statCard(theme)}>
    <Box css={css({ color: theme.vars.palette.primary.main, marginBottom: theme.spacing(0.5) })}>
      {icon}
    </Box>
    <Box css={profilerStyles.statValue(theme)}>{value}</Box>
    <Box css={profilerStyles.statLabel(theme)}>{label}</Box>
  </Box>
);

const WorkflowProfilerPanel: React.FC = memo(() => {
  const theme = useTheme();
  const nodes = useNodes((state) => state.nodes);
  const edges = useNodes((state) => state.edges);
  const { isAnalyzing, lastProfile, analyzeWorkflow, clearProfile, autoProfile, toggleAutoProfile } =
    useWorkflowProfilerStore();

  const handleAnalyze = () => {
    analyzeWorkflow(nodes, edges as Edge[]);
  };

  const handleClear = () => {
    clearProfile();
  };

  return (
    <Box css={profilerStyles.container(theme)}>
      <Box css={profilerStyles.header(theme)}>
        <Typography variant="h6" css={profilerStyles.title(theme)}>
          <SpeedIcon />
          Workflow Profiler
        </Typography>
        <Box css={css({ display: "flex", gap: theme.spacing(1) })}>
          <Tooltip title={autoProfile ? "Disable auto-profile" : "Enable auto-profile"}>
            <Button
              size="small"
              variant={autoProfile ? "contained" : "outlined"}
              onClick={toggleAutoProfile}
            >
              Auto
            </Button>
          </Tooltip>
          <Tooltip title="Analyze workflow">
            <Button
              size="small"
              variant="contained"
              startIcon={<RefreshIcon />}
              onClick={handleAnalyze}
              disabled={isAnalyzing || nodes.length === 0}
            >
              {isAnalyzing ? "Analyzing..." : "Analyze"}
            </Button>
          </Tooltip>
          {lastProfile && (
            <Tooltip title="Clear results">
              <Button size="small" variant="outlined" onClick={handleClear}>
                Clear
              </Button>
            </Tooltip>
          )}
        </Box>
      </Box>

      {isAnalyzing && <LinearProgress sx={{ mb: 2 }} />}

      {nodes.length === 0 ? (
        <Box css={profilerStyles.emptyState(theme)}>
          <AccountTreeIcon sx={{ fontSize: 48, mb: 1 }} />
          <Typography variant="body1">No workflow to analyze</Typography>
          <Typography variant="body2">
            Add nodes to your workflow to see performance metrics
          </Typography>
        </Box>
      ) : !lastProfile ? (
        <Box css={profilerStyles.emptyState(theme)}>
          <SpeedIcon sx={{ fontSize: 48, mb: 1 }} />
          <Typography variant="body1">Ready to analyze</Typography>
          <Typography variant="body2">
            Click &quot;Analyze&quot; to get workflow performance insights
          </Typography>
        </Box>
      ) : (
        <>
          <Box css={profilerStyles.statsGrid(theme)}>
            <StatCard
              icon={<AccountTreeIcon />}
              value={lastProfile.nodeCount}
              label="Nodes"
              theme={theme}
            />
            <StatCard
              icon={<TrendingUpIcon />}
              value={lastProfile.edgeCount}
              label="Connections"
              theme={theme}
            />
            <StatCard
              icon={<SpeedIcon />}
              value={lastProfile.maxDepth}
              label="Max Depth"
              theme={theme}
            />
            <StatCard
              icon={<MemoryIcon />}
              value={`${(lastProfile.estimatedMemoryUsage / 1024).toFixed(1)} MB`}
              label="Est. Memory"
              theme={theme}
            />
          </Box>

          <Box css={css({ marginBottom: theme.spacing(2) })}>
            <Typography css={profilerStyles.sectionTitle(theme)}>
              Complexity Score: {lastProfile.complexityScore}
            </Typography>
            <Box css={profilerStyles.complexityBar(theme)}>
              <LinearProgress
                variant="determinate"
                value={Math.min(lastProfile.complexityScore, 100)}
                sx={{
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: theme.vars.palette.grey[200],
                  "& .MuiLinearProgress-bar": {
                    backgroundColor: getComplexityLevel(lastProfile.complexityScore).color,
                  },
                }}
              />
              <Chip
                label={getComplexityLevel(lastProfile.complexityScore).label}
                size="small"
                sx={{
                  mt: 0.5,
                  color: getComplexityLevel(lastProfile.complexityScore).color,
                  borderColor: getComplexityLevel(lastProfile.complexityScore).color,
                }}
                variant="outlined"
              />
            </Box>
          </Box>

          {lastProfile.graphMetrics.cycles && lastProfile.graphMetrics.cycleNodes && (
            <Paper
              sx={{
                p: 1.5,
                mb: 2,
                backgroundColor: theme.vars.palette.error.lighter,
                border: `1px solid ${theme.vars.palette.error.light}`,
              }}
            >
              <Box css={css({ display: "flex", alignItems: "center", gap: 1 })}>
                <WarningAmberIcon color="error" />
                <Typography variant="subtitle2" color="error.dark">
                  Cycle Detected in Workflow!
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                Nodes: {lastProfile.graphMetrics.cycleNodes.join(" → ")}
              </Typography>
            </Paper>
          )}

          {lastProfile.bottlenecks.length > 0 && (
            <Accordion sx={{ mb: 2 }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box css={css({ display: "flex", alignItems: "center", gap: 1 })}>
                  <WarningAmberIcon color="warning" />
                  <Typography variant="subtitle2">
                    Bottlenecks ({lastProfile.bottlenecks.length})
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                {lastProfile.bottlenecks.map((bottleneck: BottleneckInfo, index: number) => (
                  <Box
                    key={index}
                    css={profilerStyles.bottleneckItem(theme)}
                    className={bottleneck.severity}
                  >
                    <Typography variant="body2" fontWeight={600}>
                      {bottleneck.nodeType}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {bottleneck.reason}
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 0.5 }}>
                      💡 {bottleneck.suggestion}
                    </Typography>
                  </Box>
                ))}
              </AccordionDetails>
            </Accordion>
          )}

          {lastProfile.recommendations.length > 0 && (
            <Accordion sx={{ mb: 2 }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box css={css({ display: "flex", alignItems: "center", gap: 1 })}>
                  <LightbulbIcon color="info" />
                  <Typography variant="subtitle2">
                    Recommendations ({lastProfile.recommendations.length})
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                {lastProfile.recommendations.map((rec: string, index: number) => (
                  <Box key={index} css={profilerStyles.recommendationItem(theme)}>
                    <LightbulbIcon
                      sx={{ color: theme.vars.palette.info.main, fontSize: 18, mt: 0.25 }}
                    />
                    <Typography variant="body2">{rec}</Typography>
                  </Box>
                ))}
              </AccordionDetails>
            </Accordion>
          )}

          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle2">Graph Metrics</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <table css={profilerStyles.metricsTable(theme)}>
                <tbody>
                  <tr>
                    <td>Graph Density</td>
                    <td css={css({ fontWeight: 600, textAlign: "right" })}>
                      {(lastProfile.graphMetrics.density * 100).toFixed(1)}%
                    </td>
                  </tr>
                  <tr>
                    <td>Avg Connections/Node</td>
                    <td css={css({ fontWeight: 600, textAlign: "right" })}>
                      {lastProfile.graphMetrics.avgConnectionsPerNode.toFixed(2)}
                    </td>
                  </tr>
                  <tr>
                    <td>Source Nodes</td>
                    <td css={css({ fontWeight: 600, textAlign: "right" })}>
                      {lastProfile.graphMetrics.sourceNodes.length}
                    </td>
                  </tr>
                  <tr>
                    <td>Sink Nodes</td>
                    <td css={css({ fontWeight: 600, textAlign: "right" })}>
                      {lastProfile.graphMetrics.sinkNodes.length}
                    </td>
                  </tr>
                  <tr>
                    <td>Isolated Nodes</td>
                    <td css={css({ fontWeight: 600, textAlign: "right" })}>
                      {lastProfile.graphMetrics.isolatedNodes.length}
                    </td>
                  </tr>
                  <tr>
                    <td>Highest Fan-in</td>
                    <td css={css({ fontWeight: 600, textAlign: "right" })}>
                      {lastProfile.graphMetrics.fanInMax.nodeId} ({lastProfile.graphMetrics.fanInMax.count})
                    </td>
                  </tr>
                  <tr>
                    <td>Highest Fan-out</td>
                    <td css={css({ fontWeight: 600, textAlign: "right" })}>
                      {lastProfile.graphMetrics.fanOutMax.nodeId} ({lastProfile.graphMetrics.fanOutMax.count})
                    </td>
                  </tr>
                </tbody>
              </table>
            </AccordionDetails>
          </Accordion>

          {Object.keys(lastProfile.nodeTypeBreakdown).length > 0 && (
            <Accordion sx={{ mt: 2 }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle2">Node Types</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Box css={profilerStyles.nodeTypeBreakdown(theme)}>
                  {Object.entries(lastProfile.nodeTypeBreakdown).map(([type, count]) => (
                    <Chip
                      key={type}
                      label={`${type}: ${count}`}
                      size="small"
                      variant="outlined"
                    />
                  ))}
                </Box>
              </AccordionDetails>
            </Accordion>
          )}
        </>
      )}
    </Box>
  );
});

WorkflowProfilerPanel.displayName = "WorkflowProfilerPanel";

export default WorkflowProfilerPanel;
