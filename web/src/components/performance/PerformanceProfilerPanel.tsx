/** @jsxImportSource @emotion/react */
import React, { memo, useEffect, useMemo } from "react";
import { Box, Typography, Button, ToggleButton, ToggleButtonGroup, Divider } from "@mui/material";
import { styled } from "@mui/material/styles";
import RefreshIcon from "@mui/icons-material/Refresh";
import BarChartIcon from "@mui/icons-material/BarChart";
import TableChartIcon from "@mui/icons-material/TableChart";
import TimelineIcon from "@mui/icons-material/Timeline";
import usePerformanceProfilerStore, {
  type PerformanceProfile
} from "../../stores/PerformanceProfilerStore";
import PerformanceSummary from "./PerformanceSummary";
import PerformanceBarChart from "./PerformanceBarChart";

const PanelContainer = styled(Box)(({ theme }) => ({
  padding: theme.spacing(2),
  height: "100%",
  overflow: "auto",
  backgroundColor: theme.vars.palette.background.default
}));

const HeaderRow = styled(Box)(({ theme }) => ({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: theme.spacing(2)
}));

interface NodeData {
  name: string;
  type: string;
}

interface PerformanceProfilerPanelProps {
  workflowId: string;
  nodes: Array<{ id: string; data: NodeData }>;
  onNodeClick?: (nodeId: string) => void;
}

type ViewMode = "summary" | "chart" | "timeline";

const PerformanceProfilerPanel: React.FC<PerformanceProfilerPanelProps> = ({
  workflowId,
  nodes,
  onNodeClick
}) => {
  const [viewMode, setViewMode] = React.useState<ViewMode>("summary");
  const [localProfile, setLocalProfile] = React.useState<PerformanceProfile | null>(null);

  const nodeDataMap = useMemo(() => {
    const map: Record<string, NodeData> = {};
    for (const node of nodes) {
      map[node.id] = { name: node.data?.name || node.id, type: node.data?.type || "unknown" };
    }
    return map;
  }, [nodes]);

  const profile = usePerformanceProfilerStore((state) => state.profiles[workflowId]);

  useEffect(() => {
    if (profile) {
      setLocalProfile(profile);
    }
  }, [profile]);

  const handleRefresh = () => {
    const nodeIds = nodes.map((n) => n.id);
    const newProfile = usePerformanceProfilerStore.getState().getProfile(workflowId, nodeIds, nodeDataMap);
    setLocalProfile(newProfile);
  };

  const handleViewModeChange = (_: React.MouseEvent<HTMLElement>, newMode: ViewMode | null) => {
    if (newMode !== null) {
      setViewMode(newMode);
    }
  };

  const handleNodeClick = (nodeId: string) => {
    onNodeClick?.(nodeId);
  };

  if (!localProfile) {
    return (
      <PanelContainer>
        <HeaderRow>
          <Typography variant="h6" fontWeight={600}>
            Performance Profiler
          </Typography>
          <Button size="small" startIcon={<RefreshIcon />} onClick={handleRefresh}>
            Refresh
          </Button>
        </HeaderRow>
        <Box sx={{ textAlign: "center", py: 4 }}>
          <TimelineIcon sx={{ fontSize: 48, color: "text.secondary", mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            Run the workflow to see performance metrics
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            Performance data will appear after workflow execution completes
          </Typography>
        </Box>
      </PanelContainer>
    );
  }

  return (
    <PanelContainer>
      <HeaderRow>
        <Typography variant="h6" fontWeight={600}>
          Performance Profiler
        </Typography>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={handleViewModeChange}
            size="small"
          >
            <ToggleButton value="summary">
              <BarChartIcon fontSize="small" />
            </ToggleButton>
            <ToggleButton value="chart">
              <TableChartIcon fontSize="small" />
            </ToggleButton>
          </ToggleButtonGroup>
          <Button size="small" startIcon={<RefreshIcon />} onClick={handleRefresh}>
            Refresh
          </Button>
        </Box>
      </HeaderRow>

      {viewMode === "summary" && (
        <PerformanceSummary profile={localProfile} />
      )}

      {viewMode === "chart" && (
        <PerformanceBarChart profile={localProfile} />
      )}

      {viewMode === "timeline" && (
        <Box>
          <Typography variant="body2" color="text.secondary">
            Timeline view coming soon...
          </Typography>
        </Box>
      )}

      <Divider sx={{ my: 2 }} />

      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Performance Tips
        </Typography>
        <Box component="ul" sx={{ m: 0, pl: 2 }}>
          {localProfile.bottleneckNodes.length > 0 && (
            <li>
              <Typography variant="body2" color="text.secondary">
                {localProfile.bottleneckNodes.length} bottleneck(s) detected. Consider optimizing these
                nodes or using faster models.
              </Typography>
            </li>
          )}
          {localProfile.failedNodes > 0 && (
            <li>
              <Typography variant="body2" color="error.main">
                {localProfile.failedNodes} node(s) failed. Check logs for errors.
              </Typography>
            </li>
          )}
          {localProfile.bottleneckNodes.length === 0 && localProfile.failedNodes === 0 && (
            <li>
              <Typography variant="body2" color="text.secondary">
                Workflow executed successfully with no major performance issues.
              </Typography>
            </li>
          )}
        </Box>
      </Box>

      {localProfile.nodes.length > 0 && (
        <>
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            All Nodes ({localProfile.nodes.length})
          </Typography>
          <Box sx={{ maxHeight: 200, overflow: "auto" }}>
            {localProfile.nodes.map((node) => (
              <Box
                key={node.nodeId}
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  py: 0.5,
                  px: 1,
                  cursor: "pointer",
                  "&:hover": { bgcolor: "action.hover" },
                  borderRadius: 1
                }}
                onClick={() => handleNodeClick(node.nodeId)}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography variant="body2" noWrap>
                    {node.nodeName || node.nodeId}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    ({node.nodeType})
                  </Typography>
                </Box>
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 600,
                    color: node.status === "error" ? "error.main" : "text.primary"
                  }}
                >
                  {node.duration < 1000 ? `${node.duration}ms` : `${Math.round(node.duration / 1000)}s`}
                </Typography>
              </Box>
            ))}
          </Box>
        </>
      )}
    </PanelContainer>
  );
};

export default memo(PerformanceProfilerPanel);
