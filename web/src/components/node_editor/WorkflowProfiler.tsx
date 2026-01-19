/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useMemo, useState, useCallback } from "react";
import {
  Box,
  Typography,
  Button,
  LinearProgress,
  Chip,
  TableCell,
  TableRow,
  IconButton,
  Collapse,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import SpeedIcon from "@mui/icons-material/Speed";
import ScheduleIcon from "@mui/icons-material/Schedule";
import LayersIcon from "@mui/icons-material/Layers";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import { useProfilerStore, NodeProfile } from "../../stores/WorkflowProfilerStore";
import { useReactFlow, Node } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";

const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  if (ms < 60000) {
    const seconds = ms / 1000;
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
};

const styles = (theme: Theme) =>
  css({
    "&.workflow-profiler": {
      position: "fixed",
      top: "80px",
      right: "50px",
      width: "420px",
      maxHeight: "calc(100vh - 150px)",
      zIndex: 15000,
      display: "flex",
      flexDirection: "column",
      backgroundColor: theme.vars.palette.background.paper,
      borderRadius: "12px",
      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
      border: `1px solid ${theme.vars.palette.divider}`,
      overflow: "hidden",
      animation: "slideIn 0.2s ease-out forwards",
    },
    "& @keyframes slideIn": {
      "0%": { opacity: 0, transform: "translateX(20px)" },
      "100%": { opacity: 1, transform: "translateX(0)" },
    },
    "& .panel-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "12px 16px",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.action.hover,
    },
    "& .panel-content": {
      flex: 1,
      overflowY: "auto",
      padding: "16px",
    },
    "& .section": {
      marginBottom: "16px",
    },
    "& .section-title": {
      fontSize: "12px",
      fontWeight: 600,
      textTransform: "uppercase",
      color: theme.vars.palette.text.secondary,
      marginBottom: "8px",
      display: "flex",
      alignItems: "center",
      gap: "6px",
    },
    "& .stat-grid": {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "8px",
    },
    "& .stat-card": {
      padding: "10px",
      borderRadius: "8px",
      backgroundColor: theme.vars.palette.action.hover,
      border: `1px solid ${theme.vars.palette.divider}`,
    },
    "& .stat-value": {
      fontSize: "20px",
      fontWeight: 600,
      color: theme.vars.palette.text.primary,
    },
    "& .stat-label": {
      fontSize: "11px",
      color: theme.vars.palette.text.secondary,
      marginTop: "2px",
    },
    "& .bottleneck-alert": {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "10px 12px",
      borderRadius: "8px",
      backgroundColor: theme.vars.palette.warning.light,
      border: `1px solid ${theme.vars.palette.warning.main}`,
      color: theme.vars.palette.warning.contrastText,
      fontSize: "13px",
    },
    "& .speedup-bar": {
      height: "8px",
      borderRadius: "4px",
      backgroundColor: theme.vars.palette.action.hover,
      overflow: "hidden",
      marginTop: "4px",
    },
    "& .speedup-fill": {
      height: "100%",
      borderRadius: "4px",
      background: `linear-gradient(90deg, ${theme.vars.palette.primary.main}, ${theme.vars.palette.secondary.main})`,
      transition: "width 0.3s ease",
    },
    "& .node-table": {
      fontSize: "12px",
      "& .MuiTableCell-root": {
        padding: "6px 8px",
        borderColor: theme.vars.palette.divider,
      },
      "& .MuiTableCell-head": {
        fontWeight: 600,
        backgroundColor: theme.vars.palette.action.hover,
      },
    },
    "& .node-type-chip": {
      fontSize: "10px",
      height: "20px",
    },
    "& .expand-section": {
      cursor: "pointer",
      userSelect: "none",
      "&:hover": {
        opacity: 0.8,
      },
    },
  });

interface StatCardProps {
  icon: React.ReactNode;
  value: string;
  label: string;
  color?: string;
}

const StatCard: React.FC<StatCardProps> = ({ icon, value, label, color }) => {
  return (
    <div className="stat-card">
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: color || "inherit" }}>
        {icon}
        <div className="stat-value" style={{ color }}>{value}</div>
      </Box>
      <div className="stat-label">{label}</div>
    </div>
  );
};

interface WorkflowProfilerProps {
  onClose: () => void;
  onFocusNode: (nodeId: string) => void;
}

const WorkflowProfiler: React.FC<WorkflowProfilerProps> = ({
  onClose,
  onFocusNode,
}) => {
  const theme = useTheme();
  const { getNodes, getEdges } = useReactFlow();
  const { profile, isAnalyzing, error } = useProfilerStore();

  const cssStyles = useMemo(() => styles(theme), [theme]);

  const handleAnalyze = useCallback(() => {
    const nodes = getNodes() as Node<NodeData>[];
    const edges = getEdges();
    useProfilerStore.getState().analyzeWorkflow(nodes, edges, "current");
  }, [getNodes, getEdges]);

  const handleFocusNode = useCallback((nodeId: string) => {
    onFocusNode(nodeId);
  }, [onFocusNode]);

  const nodesByLevel = useMemo(() => {
    if (!profile) {
      return new Map<number, NodeProfile[]>();
    }
    const byLevel = new Map<number, NodeProfile[]>();
    profile.nodes.forEach((node) => {
      const existing = byLevel.get(node.level) ?? [];
      existing.push(node);
      byLevel.set(node.level, existing);
    });
    return byLevel;
  }, [profile]);

  return (
    <div className="workflow-profiler" css={cssStyles}>
      <div className="panel-header">
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <SpeedIcon color="primary" />
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Workflow Profiler
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Button
            size="small"
            variant="contained"
            onClick={handleAnalyze}
            disabled={isAnalyzing}
            sx={{ mr: 1 }}
          >
            {isAnalyzing ? "Analyzing..." : "Analyze"}
          </Button>
          <IconButton size="small" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </div>

      <div className="panel-content">
        {error && (
          <Box
            sx={{
              padding: "8px 12px",
              borderRadius: "6px",
              backgroundColor: theme.vars.palette.error.light,
              color: theme.vars.palette.error.contrastText,
              mb: 2,
              fontSize: "13px",
            }}
          >
            Error: {error}
          </Box>
        )}

        {!profile && !isAnalyzing && (
          <Box
            sx={{
              textAlign: "center",
              py: 4,
              color: theme.vars.palette.text.secondary,
            }}
          >
            <SpeedIcon sx={{ fontSize: 48, mb: 2, opacity: 0.5 }} />
            <Typography variant="body2">
              Click &quot;Analyze&quot; to profile your workflow performance
            </Typography>
            <Typography variant="caption" sx={{ display: "block", mt: 1 }}>
              Get execution time estimates, parallelization opportunities, and bottleneck identification
            </Typography>
          </Box>
        )}

        {isAnalyzing && <LinearProgress sx={{ mb: 2 }} />}

        {profile && (
          <>
            <div className="section">
              <div className="section-title">
                <ScheduleIcon fontSize="small" />
                Estimated Execution
              </div>
              <div className="stat-grid">
                <StatCard
                  icon={<ScheduleIcon />}
                  value={formatDuration(profile.estimatedTotalTimeMs)}
                  label="Total Time"
                  color={theme.vars.palette.primary.main}
                />
                <StatCard
                  icon={<LayersIcon />}
                  value={profile.parallelLayers.toString()}
                  label="Parallel Layers"
                  color={theme.vars.palette.secondary.main}
                />
                <StatCard
                  icon={<TrendingUpIcon />}
                  value={`${profile.theoreticalSpeedup}x`}
                  label="Speedup Potential"
                  color={theme.vars.palette.success.main}
                />
                <StatCard
                  icon={<SpeedIcon />}
                  value={profile.totalNodes.toString()}
                  label="Total Nodes"
                />
              </div>
            </div>

            <div className="section">
              <div className="section-title">
                <TrendingUpIcon fontSize="small" />
                Parallelization
              </div>
              <Box
                sx={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  backgroundColor: theme.vars.palette.action.hover,
                  border: `1px solid ${theme.vars.palette.divider}`,
                }}
              >
                <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
                  <Typography variant="body2">
                    {profile.parallelizableNodes} parallelizable / {profile.sequentialNodes} sequential
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {profile.theoreticalSpeedup}x theoretical speedup
                  </Typography>
                </Box>
                <div className="speedup-bar">
                  <div
                    className="speedup-fill"
                    style={{
                      width: `${Math.min(100, (profile.theoreticalSpeedup / 5) * 100)}%`,
                    }}
                  />
                </div>
              </Box>
            </div>

            {profile.bottleneckNodeIds.length > 0 && (
              <div className="section">
                <div className="section-title">
                  <WarningAmberIcon fontSize="small" />
                  Potential Bottlenecks
                </div>
                <div className="bottleneck-alert">
                  <WarningAmberIcon fontSize="small" />
                  <Typography variant="body2">
                    {profile.bottleneckNodeIds.length} node(s) may significantly impact execution time
                  </Typography>
                </div>
              </div>
            )}

            <div className="section">
              <ParallelLayersView
                nodesByLevel={nodesByLevel}
                onFocusNode={handleFocusNode}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

interface ParallelLayersViewProps {
  nodesByLevel: Map<number, NodeProfile[]>;
  onFocusNode: (nodeId: string) => void;
}

const ParallelLayersView: React.FC<ParallelLayersViewProps> = ({
  nodesByLevel,
  onFocusNode,
}) => {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(true);
  const maxLevel = Math.max(...Array.from(nodesByLevel.keys()), 0);

  return (
    <Box>
      <Box
        className="expand-section"
        onClick={() => setExpanded(!expanded)}
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 1,
        }}
      >
        <div className="section-title" style={{ margin: 0 }}>
          <LayersIcon fontSize="small" />
          Execution Layers ({maxLevel + 1} total)
        </div>
        {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
      </Box>

      <Collapse in={expanded}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {Array.from(nodesByLevel.entries())
            .sort(([a], [b]) => a - b)
            .map(([level, nodes]) => {
              const layerTime = Math.max(...nodes.map((n) => n.estimatedTimeMs));
              const isHeavyLayer = layerTime > 500;

              return (
                <Box
                  key={level}
                  sx={{
                    padding: "8px 10px",
                    borderRadius: "6px",
                    backgroundColor: isHeavyLayer
                      ? theme.vars.palette.warning.light + "22"
                      : theme.vars.palette.action.hover,
                    border: `1px solid ${
                      isHeavyLayer
                        ? theme.vars.palette.warning.main
                        : theme.vars.palette.divider
                    }`,
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      mb: 1,
                    }}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Chip
                        label={`Layer ${level}`}
                        size="small"
                        color={isHeavyLayer ? "warning" : "default"}
                      />
                      <Typography variant="caption" color="text.secondary">
                        {nodes.length} node(s)
                      </Typography>
                    </Box>
                    <Typography
                      variant="caption"
                      sx={{
                        fontFamily: "monospace",
                        fontWeight: 500,
                        color: isHeavyLayer
                          ? theme.vars.palette.warning.main
                          : "inherit",
                      }}
                    >
                      {formatDuration(layerTime)}
                    </Typography>
                  </Box>

                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                    {nodes.map((node) => (
                      <Chip
                        key={node.nodeId}
                        label={node.nodeType.split(".").pop()}
                        size="small"
                        variant="outlined"
                        onClick={() => onFocusNode(node.nodeId)}
                        sx={{
                          fontSize: "10px",
                          height: "20px",
                          opacity: node.isComputational ? 1 : 0.7,
                        }}
                      />
                    ))}
                  </Box>
                </Box>
              );
            })}
        </Box>
      </Collapse>
    </Box>
  );
};

export default memo(WorkflowProfiler);
