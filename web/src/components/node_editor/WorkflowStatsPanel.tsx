import { memo, useCallback, useMemo, useState } from "react";
import {
  Box,
  Tooltip,
  Typography,
  Popover,
  List,
  ListItem,
  ListItemText,
  Divider
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import BarChartIcon from "@mui/icons-material/BarChart";
import useWorkflowStatsStore, {
  type WorkflowStats
} from "../../stores/WorkflowStatsStore";

interface WorkflowStatsPanelProps {
  workflowId: string;
  visible?: boolean;
}

interface StatRowProps {
  label: string;
  value: string | number;
  color?: string;
}

const StatRow: React.FC<StatRowProps> = ({ label, value, color }) => {
  const theme = useTheme();
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        py: 0.25
      }}
    >
      <Typography
        variant="caption"
        sx={{ color: theme.vars.palette.text.secondary }}
      >
        {label}
      </Typography>
      <Typography
        variant="caption"
        sx={{
          fontWeight: 600,
          color: color || theme.vars.palette.text.primary,
          fontFamily: "JetBrains Mono, monospace"
        }}
      >
        {value}
      </Typography>
    </Box>
  );
};

const WorkflowStatsPanel: React.FC<WorkflowStatsPanelProps> = ({
  workflowId,
  visible = true
}) => {
  const theme = useTheme();
  const stats = useWorkflowStatsStore((state) => state.getStats(workflowId));
  const [statsMenuAnchor, setStatsMenuAnchor] = useState<HTMLElement | null>(
    null
  );

  const handleOpenStatsMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      setStatsMenuAnchor(event.currentTarget);
    },
    []
  );

  const handleCloseStatsMenu = useCallback(() => {
    setStatsMenuAnchor(null);
  }, []);

  const complexityLabel = useMemo(
    () => {
      const score = stats.complexityScore;
      if (score <= 10) {
        return "Simple";
      }
      if (score <= 30) {
        return "Moderate";
      }
      if (score <= 60) {
        return "Complex";
      }
      return "Very Complex";
    },
    [stats.complexityScore]
  );

  const complexityColor = useMemo(() => {
    const score = stats.complexityScore;
    if (score <= 10) {
      return theme.palette.success.main;
    }
    if (score <= 30) {
      return theme.palette.info.main;
    }
    if (score <= 60) {
      return theme.palette.warning.main;
    }
    return theme.palette.error.main;
  }, [stats.complexityScore, theme]);

  const hasSelection = useMemo(
    () => stats.selectedNodeCount > 0 || stats.selectedEdgeCount > 0,
    [stats.selectedNodeCount, stats.selectedEdgeCount]
  );

  if (!visible) {
    return null;
  }

  return (
    <>
      <Box
        sx={{
          position: "absolute",
          bottom: 16,
          right: 180,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          backgroundColor: theme.vars.palette.Paper.paper,
          backdropFilter: "blur(8px)",
          borderRadius: "8px",
          border: `1px solid ${theme.vars.palette.divider}`,
          padding: "4px 8px",
          boxShadow: theme.shadows[4],
          userSelect: "none",
          pointerEvents: "auto"
        }}
      >
        <Tooltip title="Workflow Statistics" placement="top" arrow>
          <Box
            component="button"
            onClick={handleOpenStatsMenu}
            sx={{
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              padding: "2px 6px",
              borderRadius: "4px",
              transition: "all 0.15s ease",
              "&:hover": {
                backgroundColor: theme.vars.palette.action.hover
              }
            }}
          >
            <BarChartIcon
              sx={{
                fontSize: "1rem",
                color: theme.vars.palette.text.secondary
              }}
            />
            <Typography
              variant="caption"
              sx={{
                fontWeight: 500,
                fontFamily: "JetBrains Mono, monospace",
                color: theme.vars.palette.text.secondary
              }}
            >
              {stats.nodeCount} nodes
            </Typography>
          </Box>
        </Tooltip>
      </Box>

      <Popover
        open={Boolean(statsMenuAnchor)}
        anchorEl={statsMenuAnchor}
        onClose={handleCloseStatsMenu}
        anchorOrigin={{
          vertical: "top",
          horizontal: "center"
        }}
        transformOrigin={{
          vertical: "bottom",
          horizontal: "center"
        }}
        PaperProps={{
          sx: {
            minWidth: 220,
            py: 1
          }
        }}
      >
        <Box sx={{ px: 2, pb: 1 }}>
          <Typography
            variant="subtitle2"
            sx={{ fontWeight: 600, mb: 1 }}
          >
            Workflow Statistics
          </Typography>
        </Box>

        <Divider />

        <List dense disablePadding sx={{ px: 1.5, py: 1 }}>
          <StatRow label="Nodes" value={stats.nodeCount} />
          <StatRow label="Connections" value={stats.edgeCount} />

          <Box sx={{ my: 1 }}>
            <Divider />
          </Box>

          <StatRow
            label="Inputs"
            value={stats.inputNodeCount}
            color={theme.palette.info.main}
          />
          <StatRow
            label="Outputs"
            value={stats.outputNodeCount}
            color={theme.palette.warning.main}
          />
          <StatRow
            label="Processing"
            value={stats.processingNodeCount}
            color={theme.palette.success.main}
          />
          <StatRow
            label="Groups"
            value={stats.groupNodeCount}
            color={theme.palette.secondary.main}
          />

          <Box sx={{ my: 1 }}>
            <Divider />
          </Box>

          <StatRow
            label="Complexity"
            value={`${stats.complexityScore} (${complexityLabel})`}
            color={complexityColor}
          />
        </List>

        {hasSelection && (
          <>
            <Divider />
            <Box sx={{ px: 2, py: 1, bgcolor: theme.vars.palette.action.hover }}>
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 600,
                  color: theme.vars.palette.text.secondary
                }}
              >
                Selection
              </Typography>
              <Box sx={{ mt: 0.5 }}>
                <StatRow
                  label="Nodes"
                  value={stats.selectedNodeCount}
                />
                <StatRow
                  label="Connections"
                  value={stats.selectedEdgeCount}
                />
              </Box>
            </Box>
          </>
        )}
      </Popover>
    </>
  );
};

export default memo(WorkflowStatsPanel);
