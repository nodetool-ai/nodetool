/**
 * WorkflowProfilerPanel Component
 *
 * Displays workflow performance analysis including:
 * - Estimated vs actual execution time
 * - Bottleneck identification
 * - Layer analysis and parallelism opportunities
 * - Optimization suggestions
 *
 * @example
 * ```typescript
 * <WorkflowProfilerPanel
 *   workflowId="workflow-123"
 *   nodes={nodes}
 *   edges={edges}
 *   isOpen={true}
 *   onClose={() => setIsOpen(false)}
 * />
 * ```
 */
import React, { useEffect, useCallback, useMemo } from "react";
import {
  Box,
  Typography,
  Button,
  Paper,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Chip,
  LinearProgress,
  IconButton,
  Tooltip,
  Collapse,
  Divider,
} from "@mui/material";
import {
  ExpandMore,
  ExpandLess,
  Refresh,
  Speed,
  Timeline,
  TrendingUp,
  Lightbulb,
  Warning,
  AutoAwesome,
  Storage,
  Cached,
} from "@mui/icons-material";
import { useTheme } from "@mui/material/styles";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import useWorkflowProfiler from "../../hooks/useWorkflowProfiler";
import { useSelectedNodes } from "../../contexts/NodeContext";

interface WorkflowProfilerPanelProps {
  workflowId: string;
  nodes: Node<NodeData>[];
  edges: Edge[];
  isOpen: boolean;
  onClose: () => void;
}

interface SuggestionItemProps {
  suggestion: {
    type: string;
    severity: string;
    title: string;
    description: string;
    affectedNodes: string[];
    potentialImprovement?: string;
  };
  formatTime: (ms: number) => string;
  getSeverityColor: (severity: string) => string;
  getTypeIcon: (type: string) => string;
}

const SuggestionItem: React.FC<SuggestionItemProps> = ({
  suggestion,
  getSeverityColor,
  getTypeIcon,
}) => {
  const [expanded, setExpanded] = React.useState(false);
  const severityColor = getSeverityColor(suggestion.severity);
  const typeIcon = getTypeIcon(suggestion.type);

  const getTypeIconComponent = (type: string) => {
    switch (type) {
      case "bottleneck":
        return <Warning fontSize="small" />;
      case "parallelization":
        return <AutoAwesome fontSize="small" />;
      case "memory":
        return <Storage fontSize="small" />;
      case "caching":
        return <Cached fontSize="small" />;
      default:
        return <Lightbulb fontSize="small" />;
    }
  };

  return (
    <ListItem
      sx={{
        flexDirection: "column",
        alignItems: "stretch",
        py: 1.5,
        px: 2,
        borderLeft: 3,
        borderColor: severityColor,
        bgcolor: "background.default",
        borderRadius: 1,
        mb: 1,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          width: "100%",
          cursor: "pointer",
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <ListItemIcon sx={{ minWidth: 36 }}>{getTypeIconComponent(suggestion.type)}</ListItemIcon>
        <ListItemText
          primary={
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography variant="body2" fontWeight={500}>
                {suggestion.title}
              </Typography>
              <Chip
                label={suggestion.severity}
                size="small"
                sx={{
                  height: 18,
                  fontSize: "0.65rem",
                  bgcolor: severityColor,
                  color: "white",
                }}
              />
            </Box>
          }
          secondary={suggestion.description}
        />
        <IconButton size="small">
          {expanded ? <ExpandLess /> : <ExpandMore />}
        </IconButton>
      </Box>
      <Collapse in={expanded}>
        <Box sx={{ mt: 1, pl: 5 }}>
          {suggestion.potentialImprovement && (
            <Typography variant="caption" color="text.secondary">
              💡 {suggestion.potentialImprovement}
            </Typography>
          )}
          {suggestion.affectedNodes.length > 0 && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Affected nodes:
              </Typography>
              <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 0.5 }}>
                {suggestion.affectedNodes.map((nodeId) => (
                  <Chip
                    key={nodeId}
                    label={nodeId}
                    size="small"
                    variant="outlined"
                    sx={{ height: 20, fontSize: "0.65rem" }}
                  />
                ))}
              </Box>
            </Box>
          )}
        </Box>
      </Collapse>
    </ListItem>
  );
};

const WorkflowProfilerPanel: React.FC<WorkflowProfilerPanelProps> = ({
  workflowId,
  nodes,
  edges,
  isOpen,
  onClose,
}) => {
  const theme = useTheme();
  const selectedNodeIds = useSelectedNodes();

  const {
    profile,
    analyze,
    getSuggestions,
    clearProfile,
    formatTime,
    getSeverityColor,
    getTypeIcon,
  } = useWorkflowProfiler(workflowId);

  const suggestions = useMemo(() => getSuggestions(), [getSuggestions]);

  const handleAnalyze = useCallback(() => {
    if (nodes.length > 0) {
      clearProfile();
      analyze(nodes, edges);
    }
  }, [nodes, edges, analyze, clearProfile]);

  useEffect(() => {
    if (isOpen && nodes.length > 0 && !profile) {
      analyze(nodes, edges);
    }
  }, [isOpen, nodes, edges, analyze, profile]);

  if (!isOpen) return null;

  const hasProfile = !!profile;

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          p: 2,
          borderBottom: 1,
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Speed color="primary" />
          <Typography variant="subtitle1" fontWeight={600}>
            Workflow Profiler
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Tooltip title="Re-analyze workflow">
            <span>
              <Button
                size="small"
                startIcon={<Refresh />}
                onClick={handleAnalyze}
                disabled={nodes.length === 0}
              >
                Analyze
              </Button>
            </span>
          </Tooltip>
        </Box>
      </Box>

      <Box sx={{ flex: 1, overflow: "auto", p: 2 }}>
        {!hasProfile ? (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              py: 4,
              textAlign: "center",
            }}
          >
            <Timeline sx={{ fontSize: 48, color: "text.secondary", mb: 2 }} />
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              No profile data available
            </Typography>
            <Button
              variant="outlined"
              startIcon={<Refresh />}
              onClick={handleAnalyze}
              disabled={nodes.length === 0}
            >
              Analyze Workflow
            </Button>
          </Box>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Overview
              </Typography>
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Estimated Time
                  </Typography>
                  <Typography variant="h6" fontWeight={600}>
                    {formatTime(profile.totalEstimatedTime)}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Nodes
                  </Typography>
                  <Typography variant="h6" fontWeight={600}>
                    {profile.nodeCount}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Parallelism
                  </Typography>
                  <Typography variant="h6" fontWeight={600}>
                    {profile.layerAnalysis.maxParallelism}x
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Layers
                  </Typography>
                  <Typography variant="h6" fontWeight={600}>
                    {profile.layerAnalysis.layers.length}
                  </Typography>
                </Box>
              </Box>
            </Paper>

            {profile.bottleneckNodes.length > 0 && (
              <Paper sx={{ p: 2 }}>
                <Typography
                  variant="subtitle2"
                  color="text.secondary"
                  gutterBottom
                  sx={{ display: "flex", alignItems: "center", gap: 1 }}
                >
                  <TrendingUp fontSize="small" />
                  Bottlenecks
                </Typography>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {profile.bottleneckNodes.slice(0, 5).map((node) => {
                    const percentage = Math.round(
                      (node.estimatedTime / profile.totalEstimatedTime) * 100
                    );
                    const isSelected = selectedNodeIds.includes(node.nodeId);
                    return (
                      <Box
                        key={node.nodeId}
                        sx={{
                          p: 1,
                          borderRadius: 1,
                          bgcolor: isSelected
                            ? "action.selected"
                            : "background.default",
                          border: isSelected
                            ? `1px solid ${theme.palette.divider}`
                            : 0,
                          borderColor: isSelected
                            ? "primary.main"
                            : undefined,
                        }}
                      >
                        <Box
                          sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            mb: 0.5,
                          }}
                        >
                          <Typography variant="body2" fontWeight={500}>
                            {node.nodeType.split(".").pop()}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatTime(node.estimatedTime)} ({percentage}%)
                          </Typography>
                        </Box>
                        <LinearProgress
                          variant="determinate"
                          value={percentage}
                          sx={{
                            height: 6,
                            borderRadius: 3,
                            bgcolor: "grey.200",
                            "& .MuiLinearProgress-bar": {
                              bgcolor:
                                percentage > 50
                                  ? "error.main"
                                  : percentage > 30
                                  ? "warning.main"
                                  : "info.main",
                            },
                          }}
                        />
                      </Box>
                    );
                  })}
                </Box>
              </Paper>
            )}

            <Paper sx={{ p: 2 }}>
              <Typography
                variant="subtitle2"
                color="text.secondary"
                gutterBottom
                sx={{ display: "flex", alignItems: "center", gap: 1 }}
              >
                <Timeline fontSize="small" />
                Execution Layers
              </Typography>
              <List dense sx={{ py: 0 }}>
                {profile.layerAnalysis.layers.map((layer, index) => (
                  <ListItem
                    key={layer.layerIndex}
                    sx={{
                      px: 1,
                      py: 0.5,
                      borderBottom:
                        index < profile.layerAnalysis.layers.length - 1
                          ? `1px dashed ${theme.palette.divider}`
                          : "none",
                    }}
                  >
                    <ListItemText
                      primary={
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <Chip
                            label={`L${layer.layerIndex}`}
                            size="small"
                            sx={{
                              height: 20,
                              fontSize: "0.65rem",
                              bgcolor: layer.canRunInParallel
                                ? "success.light"
                                : "grey.300",
                              color: layer.canRunInParallel
                                ? "success.dark"
                                : "text.secondary",
                            }}
                          />
                          <Typography variant="body2">
                            {layer.nodeIds.length} node
                            {layer.nodeIds.length !== 1 ? "s" : ""}
                          </Typography>
                          {layer.canRunInParallel && (
                            <Typography variant="caption" color="success.main">
                              ⚡ parallel
                            </Typography>
                          )}
                        </Box>
                      }
                      secondary={formatTime(layer.estimatedTime)}
                    />
                  </ListItem>
                ))}
              </List>
            </Paper>

            {suggestions.length > 0 && (
              <Paper sx={{ p: 2 }}>
                <Typography
                  variant="subtitle2"
                  color="text.secondary"
                  gutterBottom
                  sx={{ display: "flex", alignItems: "center", gap: 1 }}
                >
                  <Lightbulb fontSize="small" />
                  Optimization Suggestions
                </Typography>
                <List sx={{ py: 0 }}>
                  {suggestions.map((suggestion, index) => (
                    <SuggestionItem
                      key={index}
                      suggestion={suggestion}
                      formatTime={formatTime}
                      getSeverityColor={getSeverityColor}
                      getTypeIcon={getTypeIcon}
                    />
                  ))}
                </List>
              </Paper>
            )}

            {profile.criticalPath.length > 0 && (
              <Paper sx={{ p: 2 }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Critical Path
                </Typography>
                <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                  {profile.criticalPath.map((nodeId, index) => (
                    <React.Fragment key={nodeId}>
                      <Chip
                        label={nodeId}
                        size="small"
                        variant="outlined"
                        color="error"
                        sx={{ maxWidth: 100 }}
                      />
                      {index < profile.criticalPath.length - 1 && (
                        <Typography variant="body2" color="text.secondary" sx={{ alignSelf: "center" }}>
                          →
                        </Typography>
                      )}
                    </React.Fragment>
                  ))}
                </Box>
              </Paper>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default WorkflowProfilerPanel;
