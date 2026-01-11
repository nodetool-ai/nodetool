/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box, Typography, List, ListItem, ListItemText, Chip, LinearProgress } from "@mui/material";
import { memo } from "react";
import { useWorkflowStats } from "../../hooks/useWorkflowStats";

const styles = (theme: Theme) =>
  css({
    padding: theme.spacing(2),
    height: "100%",
    overflow: "auto",
    backgroundColor: theme.vars.palette.background.default,
    "& .section-title": {
      fontSize: "0.75rem",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      color: theme.vars.palette.text.secondary,
      marginBottom: theme.spacing(1),
      marginTop: theme.spacing(2),
      "&:first-of-type": {
        marginTop: 0
      }
    },
    "& .stat-row": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: theme.spacing(0.75, 0),
      "&:not(:last-child)": {
        borderBottom: `1px solid ${theme.vars.palette.divider}`
      }
    },
    "& .stat-label": {
      fontSize: "0.875rem",
      color: theme.vars.palette.text.primary
    },
    "& .stat-value": {
      fontSize: "0.875rem",
      fontWeight: 500,
      color: theme.vars.palette.primary.main
    },
    "& .complexity-bar": {
      marginTop: theme.spacing(1),
      marginBottom: theme.spacing(1)
    },
    "& .node-type-chip": {
      fontSize: "0.75rem",
      height: 24
    },
    "& .no-data": {
      textAlign: "center",
      color: theme.vars.palette.text.secondary,
      fontSize: "0.875rem",
      padding: theme.spacing(4, 2)
    }
  });

const formatNumber = (num: number): string => {
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "k";
  }
  return num.toString();
};

const getComplexityLabel = (score: number): { label: string; color: string } => {
  if (score < 20) {
    return { label: "Simple", color: "success" };
  } else if (score < 50) {
    return { label: "Moderate", color: "info" };
  } else if (score < 100) {
    return { label: "Complex", color: "warning" };
  }
  return { label: "Very Complex", color: "error" };
};

const ComplexityIndicator = memo(function ComplexityIndicator({
  score
}: {
  score: number;
}) {
  const maxScore = 200;
  const progress = Math.min((score / maxScore) * 100, 100);
  const { label, color } = getComplexityLabel(score);

  return (
    <Box>
      <Box className="stat-row">
        <Typography className="stat-label">Complexity</Typography>
        <Chip label={label} color={color as "success" | "info" | "warning" | "error"} size="small" />
      </Box>
      <Box className="complexity-bar">
        <LinearProgress
          variant="determinate"
          value={progress}
          color={color as "success" | "info" | "warning" | "error"}
          sx={{ height: 6, borderRadius: 3 }}
        />
      </Box>
      <Typography variant="caption" color="text.secondary">
        Score: {score}
      </Typography>
    </Box>
  );
});

const NodeTypeList = memo(function NodeTypeList({
  breakdown
}: {
  breakdown: Record<string, number>;
}) {
  const theme = useTheme();
  const entries = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    return null;
  }

  const maxCount = entries[0]?.[1] || 1;

  return (
    <List dense>
      {entries.map(([type, count]) => {
        const percentage = Math.round((count / maxCount) * 100);
        const displayType = type.split(".").pop() || type;

        return (
          <ListItem
            key={type}
            sx={{
              px: 0,
              py: 0.5,
              "&:last-child": {
                pb: 0
              }
            }}
          >
            <ListItemText
              primary={displayType}
              primaryTypographyProps={{
                fontSize: "0.8125rem",
                noWrap: true
              }}
              secondary={
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    mt: 0.5
                  }}
                >
                  <Box
                    sx={{
                      flexGrow: percentage,
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: theme.vars.palette.primary.main,
                      opacity: 0.3
                    }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {count}
                  </Typography>
                </Box>
              }
              secondaryTypographyProps={{ component: "div" }}
            />
          </ListItem>
        );
      })}
    </List>
  );
});

const WorkflowStatsPanel: React.FC = () => {
  const theme = useTheme();
  const { stats } = useWorkflowStats();

  const hasData = stats.nodeCount > 0 || stats.edgeCount > 0;

  if (!hasData) {
    return (
      <Box css={styles(theme)}>
        <Typography className="no-data">
          No workflow data available. Add nodes to see statistics.
        </Typography>
      </Box>
    );
  }

  return (
    <Box css={styles(theme)}>
      <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
        Workflow Statistics
      </Typography>

      <Typography className="section-title">Overview</Typography>
      <Box>
        <Box className="stat-row">
          <Typography className="stat-label">Total Nodes</Typography>
          <Typography className="stat-value">{formatNumber(stats.nodeCount)}</Typography>
        </Box>
        <Box className="stat-row">
          <Typography className="stat-label">Total Connections</Typography>
          <Typography className="stat-value">{formatNumber(stats.edgeCount)}</Typography>
        </Box>
        <Box className="stat-row">
          <Typography className="stat-label">Max Depth</Typography>
          <Typography className="stat-value">{stats.maxDepth} levels</Typography>
        </Box>
      </Box>

      <Typography className="section-title">Connectivity</Typography>
      <Box>
        <Box className="stat-row">
          <Typography className="stat-label">Connected</Typography>
          <Typography className="stat-value">{formatNumber(stats.connectedNodeCount)}</Typography>
        </Box>
        <Box className="stat-row">
          <Typography className="stat-label">Disconnected</Typography>
          <Typography
            className="stat-value"
            sx={{
              color: stats.disconnectedNodeCount > 0
                ? theme.vars.palette.warning.main
                : theme.vars.palette.text.secondary
            }}
          >
            {formatNumber(stats.disconnectedNodeCount)}
          </Typography>
        </Box>
      </Box>

      <Typography className="section-title">Node Categories</Typography>
      <Box>
        <Box className="stat-row">
          <Typography className="stat-label">Inputs</Typography>
          <Typography className="stat-value">{formatNumber(stats.inputNodeCount)}</Typography>
        </Box>
        <Box className="stat-row">
          <Typography className="stat-label">Processing</Typography>
          <Typography className="stat-value">{formatNumber(stats.processingNodeCount)}</Typography>
        </Box>
        <Box className="stat-row">
          <Typography className="stat-label">Outputs</Typography>
          <Typography className="stat-value">{formatNumber(stats.outputNodeCount)}</Typography>
        </Box>
        <Box className="stat-row">
          <Typography className="stat-label">Groups</Typography>
          <Typography className="stat-value">{formatNumber(stats.groupNodeCount)}</Typography>
        </Box>
        <Box className="stat-row">
          <Typography className="stat-label">Comments</Typography>
          <Typography className="stat-value">{formatNumber(stats.commentNodeCount)}</Typography>
        </Box>
      </Box>

      <Typography className="section-title">Complexity</Typography>
      <ComplexityIndicator score={stats.complexityScore} />

      <Typography className="section-title">Node Types</Typography>
      <NodeTypeList breakdown={stats.nodeTypeBreakdown} />
    </Box>
  );
};

export default memo(WorkflowStatsPanel);
