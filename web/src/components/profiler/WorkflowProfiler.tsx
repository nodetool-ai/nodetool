import React, { useEffect } from "react";
import {
  Box,
  Paper,
  Typography,
  LinearProgress,
  Chip,
  IconButton,
  Tooltip,
  Collapse,
  Alert,
  Divider,
  Card,
  CardContent,
} from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  Speed as SpeedIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Schedule as ScheduleIcon,
  AccountTree as AccountTreeIcon,
  TrendingDown as TrendingDownIcon,
} from "@mui/icons-material";
import { useNodes } from "../../contexts/NodeContext";
import { useWorkflowProfiler } from "../../hooks/useWorkflowProfiler";

interface WorkflowProfilerProps {
  workflowId: string;
  expanded?: boolean;
}

export const WorkflowProfiler: React.FC<WorkflowProfilerProps> = ({
  workflowId,
  expanded = false,
}) => {
  const [isExpanded, setIsExpanded] = React.useState(expanded);
  const nodes = useNodes((state) => state.nodes);
  const edges = useNodes((state) => state.edges);

  const {
    isAnalyzing,
    profile,
    error,
    analyzeWorkflow,
    clearProfile,
    getScoreLabel,
    getScoreColor,
    formatDuration,
  } = useWorkflowProfiler(workflowId);

  useEffect(() => {
    if (nodes.length > 0 && isExpanded) {
      analyzeWorkflow(nodes, edges);
    }
  }, [nodes, edges, isExpanded, analyzeWorkflow]);

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
    if (!isExpanded && nodes.length > 0) {
      analyzeWorkflow(nodes, edges);
    } else if (isExpanded) {
      clearProfile();
    }
  };

  const scoreColor = getScoreColor();
  const scoreLabel = getScoreLabel();

  return (
    <Paper
      elevation={0}
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          p: 1,
          cursor: "pointer",
          bgcolor: "action.hover",
          "&:hover": {
            bgcolor: "action.selected",
          },
        }}
        onClick={handleToggle}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <SpeedIcon color={scoreColor} />
          <Typography variant="subtitle2" fontWeight={600}>
            Performance Profiler
          </Typography>
          {profile && (
            <Chip
              label={scoreLabel}
              color={scoreColor}
              size="small"
              sx={{ height: 20, fontSize: "0.7rem" }}
            />
          )}
        </Box>
        <Tooltip title={isExpanded ? "Collapse" : "Expand"}>
          <IconButton size="small">
            <ExpandMoreIcon
              sx={{
                transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s",
              }}
            />
          </IconButton>
        </Tooltip>
      </Box>

      <Collapse in={isExpanded}>
        {isAnalyzing && <LinearProgress />}
        {error && (
          <Alert severity="error" sx={{ m: 1 }}>
            {error}
          </Alert>
        )}
        {profile && !isAnalyzing && (
          <Box sx={{ p: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
              <Box sx={{ flex: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  Performance Score
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Box
                    sx={{
                      width: 120,
                      height: 8,
                      borderRadius: 4,
                      bgcolor: "grey.200",
                      overflow: "hidden",
                    }}
                  >
                    <Box
                      sx={{
                        width: `${profile.score}%`,
                        height: "100%",
                        bgcolor: scoreColor === "success" ? "success.main" : scoreColor === "warning" ? "warning.main" : "error.main",
                        transition: "width 0.3s",
                      }}
                    />
                  </Box>
                  <Typography variant="body2" fontWeight={600}>
                    {profile.score}/100
                  </Typography>
                </Box>
              </Box>
            </Box>

            <Divider sx={{ my: 1.5 }} />

            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
              <Card variant="outlined">
                <CardContent sx={{ py: 1, "&:last-child": { pb: 1 } }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    <ScheduleIcon fontSize="small" color="action" />
                    <Typography variant="caption" color="text.secondary">
                      Sequential
                    </Typography>
                  </Box>
                  <Typography variant="body1" fontWeight={600}>
                    {formatDuration(profile.totalEstimatedDuration)}
                  </Typography>
                </CardContent>
              </Card>

              <Card variant="outlined">
                <CardContent sx={{ py: 1, "&:last-child": { pb: 1 } }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    <AccountTreeIcon fontSize="small" color="action" />
                    <Typography variant="caption" color="text.secondary">
                      Parallel
                    </Typography>
                  </Box>
                  <Typography variant="body1" fontWeight={600}>
                    {formatDuration(profile.parallelDuration)}
                  </Typography>
                </CardContent>
              </Card>

              <Card variant="outlined">
                <CardContent sx={{ py: 1, "&:last-child": { pb: 1 } }}>
                  <Typography variant="caption" color="text.secondary">
                    Nodes
                  </Typography>
                  <Typography variant="body1" fontWeight={600}>
                    {profile.nodeCount}
                  </Typography>
                </CardContent>
              </Card>

              <Card variant="outlined">
                <CardContent sx={{ py: 1, "&:last-child": { pb: 1 } }}>
                  <Typography variant="caption" color="text.secondary">
                    Max Depth
                  </Typography>
                  <Typography variant="body1" fontWeight={600}>
                    {profile.maxDepth} levels
                  </Typography>
                </CardContent>
              </Card>
            </Box>

            {profile.bottlenecks.length > 0 && (
              <>
                <Divider sx={{ my: 1.5 }} />
                <Box>
                  <Typography variant="subtitle2" fontWeight={600} sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 1 }}>
                    <TrendingDownIcon fontSize="small" color="warning" />
                    Potential Bottlenecks
                  </Typography>
                  {profile.bottlenecks.map((bottleneck) => (
                    <Alert
                      key={bottleneck.nodeId}
                      severity="warning"
                      sx={{ mb: 0.5, py: 0.5 }}
                      icon={<WarningIcon />}
                    >
                      <Typography variant="body2">
                        <strong>{bottleneck.nodeType}</strong> - Estimated {formatDuration(bottleneck.estimatedDuration)}
                      </Typography>
                      {bottleneck.bottlenecks.map((msg, idx) => (
                        <Typography key={idx} variant="caption" display="block" sx={{ ml: 1 }}>
                          • {msg}
                        </Typography>
                      ))}
                    </Alert>
                  ))}
                </Box>
              </>
            )}

            {profile.parallelizableNodes.length > 0 && (
              <>
                <Divider sx={{ my: 1.5 }} />
                <Box>
                  <Typography variant="subtitle2" fontWeight={600} sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 1 }}>
                    <CheckCircleIcon fontSize="small" color="success" />
                    Parallelizable Nodes ({profile.parallelizableNodes.length})
                  </Typography>
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                    {profile.parallelizableNodes.slice(0, 10).map((nodeId) => (
                      <Chip
                        key={nodeId}
                        label={nodeId.slice(0, 8)}
                        size="small"
                        variant="outlined"
                        color="success"
                        sx={{ fontSize: "0.7rem" }}
                      />
                    ))}
                    {profile.parallelizableNodes.length > 10 && (
                      <Chip
                        label={`+${profile.parallelizableNodes.length - 10} more`}
                        size="small"
                        variant="outlined"
                        sx={{ fontSize: "0.7rem" }}
                      />
                    )}
                  </Box>
                </Box>
              </>
            )}

            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5, textAlign: "center" }}>
              Last analyzed: {new Date(profile.analyzedAt).toLocaleTimeString()}
            </Typography>
          </Box>
        )}

        {nodes.length === 0 && isExpanded && !isAnalyzing && (
          <Box sx={{ p: 2, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              Add nodes to the workflow to analyze performance
            </Typography>
          </Box>
        )}
      </Collapse>
    </Paper>
  );
};

export default WorkflowProfiler;
