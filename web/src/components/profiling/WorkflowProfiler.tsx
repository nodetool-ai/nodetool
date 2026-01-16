/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Box, Paper, Typography, Button, Chip, Divider, Alert } from "@mui/material";
import { useMemo } from "react";
import useWorkflowPerformance from "../../hooks/profiling/useWorkflowPerformance";
import PerformanceBarChart from "./PerformanceBarChart";

const styles = {
  container: css`
    padding: 16px;
    max-width: 400px;
    max-height: 500px;
    overflow-y: auto;
  `,
  section: css`
    margin-bottom: 16px;
  `,
  header: css`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  `,
  statGrid: css`
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    margin-bottom: 12px;
  `,
  statItem: css`
    padding: 8px;
    border-radius: 4px;
    background-color: rgba(0, 0, 0, 0.04);
  `,
  statValue: css`
    font-size: 18px;
    font-weight: 600;
  `,
  statLabel: css`
    font-size: 11px;
    color: rgba(0, 0, 0, 0.6);
    text-transform: uppercase;
  `,
  bottleneckList: css`
    display: flex;
    flex-direction: column;
    gap: 6px;
  `,
  bottleneckItem: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px;
    border-radius: 4px;
    background-color: rgba(244, 67, 54, 0.1);
  `,
  insightItem: css`
    margin-bottom: 8px;
  `
};

interface WorkflowProfilerProps {
  workflowId?: string;
  onClose?: () => void;
}

export const WorkflowProfiler: React.FC<WorkflowProfilerProps> = ({
  onClose
}) => {
  const {
    profile,
    insights,
    generateProfile,
    clearProfile,
    formatDuration
  } = useWorkflowPerformance();

  const hasData = profile !== null && profile.executedNodeCount > 0;

  const handleGenerateProfile = (): void => {
    generateProfile();
  };

  const chartData = useMemo(() => {
    if (!profile) {
      return [];
    }
    return profile.nodes
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10)
      .map(node => ({
        label: node.nodeName.length > 15 ? node.nodeName.substring(0, 15) + "..." : node.nodeName,
        value: node.duration,
        percentage: node.percentageOfTotal,
        isBottleneck: node.isBottleneck
      }));
  }, [profile]);

  if (!hasData) {
    return (
      <Paper css={styles.container}>
        <Box css={styles.header}>
          <Typography variant="h6">Workflow Profiler</Typography>
          {onClose && (
            <Button size="small" onClick={onClose}>Close</Button>
          )}
        </Box>

        <Typography variant="body2" color="text.secondary" paragraph>
          Analyze workflow performance after execution to identify bottlenecks and optimization opportunities.
        </Typography>

        <Button
          variant="contained"
          fullWidth
          onClick={handleGenerateProfile}
          disabled={!profile}
        >
          {profile ? "Analyze Performance" : "No execution data available"}
        </Button>

        {!profile && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
            Run a workflow first to collect execution timing data.
          </Typography>
        )}
      </Paper>
    );
  }

  return (
    <Paper css={styles.container}>
      <Box css={styles.header}>
        <Typography variant="h6">Workflow Profiler</Typography>
        <Button size="small" onClick={clearProfile}>Clear</Button>
      </Box>

      <Box css={styles.section}>
        <Typography variant="subtitle2" gutterBottom>Summary</Typography>
        <Box css={styles.statGrid}>
          <Box css={styles.statItem}>
            <Box css={styles.statValue}>{formatDuration(profile.totalDuration)}</Box>
            <Box css={styles.statLabel}>Total Time</Box>
          </Box>
          <Box css={styles.statItem}>
            <Box css={styles.statValue}>{profile.executedNodeCount}/{profile.nodeCount}</Box>
            <Box css={styles.statLabel}>Nodes Executed</Box>
          </Box>
          <Box css={styles.statItem}>
            <Box css={styles.statValue}>{formatDuration(profile.averageNodeDuration)}</Box>
            <Box css={styles.statLabel}>Avg per Node</Box>
          </Box>
          <Box css={styles.statItem}>
            <Box css={styles.statValue}>{profile.bottlenecks.length}</Box>
            <Box css={styles.statLabel}>Bottlenecks</Box>
          </Box>
        </Box>
      </Box>

      {chartData.length > 0 && (
        <Box css={styles.section}>
          <Typography variant="subtitle2" gutterBottom>Execution Time by Node</Typography>
          <PerformanceBarChart data={chartData} formatDuration={formatDuration} />
        </Box>
      )}

      {profile.bottlenecks.length > 0 && (
        <Box css={styles.section}>
          <Typography variant="subtitle2" gutterBottom>
            Bottlenecks (≥{20}% of total)
          </Typography>
          <Box css={styles.bottleneckList}>
            {profile.bottlenecks.map(node => (
              <Box key={node.nodeId} css={styles.bottleneckItem}>
                <Box>
                  <Typography variant="body2" fontWeight={500}>{node.nodeName}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {node.nodeType}
                  </Typography>
                </Box>
                <Box textAlign="right">
                  <Typography variant="body2" fontWeight={600}>
                    {formatDuration(node.duration)}
                  </Typography>
                  <Chip
                    label={`${node.percentageOfTotal.toFixed(1)}%`}
                    size="small"
                    color="error"
                    sx={{ height: 20, fontSize: 10 }}
                  />
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {insights.length > 0 && (
        <Box css={styles.section}>
          <Typography variant="subtitle2" gutterBottom>Insights</Typography>
          {insights.map((insight, index) => (
            <Alert
              key={index}
              severity={insight.type}
              css={styles.insightItem}
              sx={{ py: 0.5, px: 1 }}
            >
              <Typography variant="body2">{insight.message}</Typography>
              {insight.suggestion && (
                <Typography variant="caption" color="text.secondary">
                  💡 {insight.suggestion}
                </Typography>
              )}
            </Alert>
          ))}
        </Box>
      )}

      <Divider sx={{ my: 2 }} />

      <Button
        variant="outlined"
        fullWidth
        onClick={handleGenerateProfile}
      >
        Refresh Analysis
      </Button>
    </Paper>
  );
};

export default WorkflowProfiler;
