import React, { useState, useMemo } from "react";
import {
  Box,
  Paper,
  Typography,
  Button,
  Chip,
  Grid,
  Card,
  CardContent,
  Divider
} from "@mui/material";
import {
  Speed,
  Timeline,
  TrendingDown,
  CheckCircle,
  Warning,
  Schedule
} from "@mui/icons-material";
import { PerformancePanel } from "./PerformancePanel";
import { PerformanceTimeline } from "./PerformanceTimeline";
import usePerformanceProfiler from "../../hooks/usePerformanceProfiler";

interface PerformanceDemoProps {
  workflowId?: string;
}

const generateMockNodes = (): { id: string; type: string; data: Record<string, any> }[] => {
  const nodeTypes = [
    "nodetool.input.StringInput",
    "nodetool.processing.LLM",
    "nodetool.output.TextOutput",
    "nodetool.processing.Embeddings",
    "nodetool.input.FileInput",
    "nodetool.processing.OCR",
    "nodetool.output.ImageOutput"
  ];

  const labels = [
    "user_input",
    "llm_processor",
    "text_result",
    "embedding_gen",
    "document",
    "ocr_process",
    "image_output"
  ];

  return nodeTypes.map((type, index) => ({
    id: `node_${index + 1}`,
    type,
    data: {
      label: labels[index]
    }
  }));
};

export const PerformanceDemo: React.FC<PerformanceDemoProps> = ({
  workflowId: initialWorkflowId = "demo-workflow"
}) => {
  const [workflowId, setWorkflowId] = useState(initialWorkflowId);
  const [isRunning, setIsRunning] = useState(false);
  const [nodes, setNodes] = useState(generateMockNodes());

  const {
    profile,
    analyzeWorkflow,
    getBottlenecks,
    getAverageDuration,
    getTotalDuration
  } = usePerformanceProfiler();

  const handleRunDemo = () => {
    setIsRunning(true);

    setTimeout(() => {
      const durations = [120, 2500, 150, 800, 3500, 1200, 100];
      const statuses = ["completed", "completed", "completed", "completed", "running", "completed", "pending"];

      durations.forEach((duration, index) => {
        useExecutionTimeStore.getState().startExecution(workflowId, nodes[index].id);
        setTimeout(() => {
          useExecutionTimeStore.getState().endExecution(workflowId, nodes[index].id);
        }, duration + Math.random() * 100);
      });

      statuses.forEach((status, index) => {
        useStatusStore.getState().setStatus(workflowId, nodes[index].id, status);
      });

      setTimeout(() => {
        setIsRunning(false);
        analyzeWorkflow(workflowId, nodes);
      }, 4000);
    }, 500);
  };

  const handleClear = () => {
    useExecutionTimeStore.getState().clearTimings(workflowId);
    useStatusStore.getState().clearStatuses(workflowId);
    setNodes(generateMockNodes());
  };

  const bottlenecks = useMemo(() => {
    return getBottlenecks(workflowId, 3);
  }, [getBottlenecks, workflowId]);

  const averageDuration = useMemo(() => {
    return getAverageDuration(workflowId);
  }, [getAverageDuration, workflowId]);

  const totalDuration = useMemo(() => {
    return getTotalDuration(workflowId);
  }, [getTotalDuration, workflowId]);

  const formatDuration = (ms: number | undefined): string => {
    if (ms === undefined) return "-";
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={600} gutterBottom>
          Workflow Performance Profiler
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Analyze and visualize workflow execution performance, identify bottlenecks, and optimize node execution times.
        </Typography>

        <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
          <Button
            variant="contained"
            startIcon={<Speed />}
            onClick={handleRunDemo}
            disabled={isRunning}
          >
            {isRunning ? "Running Demo..." : "Run Demo"}
          </Button>
          <Button
            variant="outlined"
            onClick={handleClear}
          >
            Clear Data
          </Button>
        </Box>
      </Box>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined">
            <CardContent>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                <Speed color="primary" />
                <Typography variant="subtitle1" fontWeight={600}>
                  Performance Metrics
                </Typography>
              </Box>

              <Grid container spacing={2}>
                <Grid size={{ xs: 4 }}>
                  <Box sx={{ textAlign: "center" }}>
                    <Typography variant="h4" fontWeight={700} color="primary">
                      {formatDuration(totalDuration)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Total Time
                    </Typography>
                  </Box>
                </Grid>
                <Grid size={{ xs: 4 }}>
                  <Box sx={{ textAlign: "center" }}>
                    <Typography variant="h4" fontWeight={700} color="success.main">
                      {profile?.completedCount || 0}/{nodes.length}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Completed
                    </Typography>
                  </Box>
                </Grid>
                <Grid size={{ xs: 4 }}>
                  <Box sx={{ textAlign: "center" }}>
                    <Typography variant="h4" fontWeight={700} color="text.secondary">
                      {formatDuration(averageDuration)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Avg Duration
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined">
            <CardContent>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                <TrendingDown color="warning" />
                <Typography variant="subtitle1" fontWeight={600}>
                  Bottlenecks
                </Typography>
              </Box>

              {bottlenecks.length > 0 ? (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {bottlenecks.map((node, index) => (
                    <Box
                      key={node.nodeId}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        p: 1,
                        borderRadius: 1,
                        backgroundColor: "action.hover"
                      }}
                    >
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Chip
                          label={index + 1}
                          size="small"
                          color={index === 0 ? "error" : "default"}
                          sx={{ width: 24, height: 24 }}
                        />
                        <Typography variant="body2" fontWeight={500}>
                          {node.nodeLabel}
                        </Typography>
                      </Box>
                      <Typography variant="body2" fontWeight={600}>
                        {formatDuration(node.duration)}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Run the workflow to see bottlenecks
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12 }}>
          <PerformanceTimeline
            workflowId={workflowId}
            nodes={nodes}
            width={800}
            height={200}
          />
        </Grid>

        <Grid size={{ xs: 12 }}>
          <PerformancePanel
            workflowId={workflowId}
            nodes={nodes}
            onNodeClick={(nodeId) => {
              console.log("Clicked node:", nodeId);
            }}
          />
        </Grid>
      </Grid>

      <Divider sx={{ my: 3 }} />

      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          Features
        </Typography>
        <Grid container spacing={1}>
          {[
            { icon: <Timeline />, label: "Execution Timeline", desc: "Gantt chart view of node execution" },
            { icon: <TrendingDown />, label: "Bottleneck Detection", desc: "Identify slowest nodes automatically" },
            { icon: <Speed />, label: "Performance Metrics", desc: "Total time, completion rate, averages" },
            { icon: <CheckCircle />, label: "Error Tracking", desc: "Highlight failed nodes" }
          ].map((feature) => (
            <Grid size={{ xs: 12, sm: 6 }} key={feature.label}>
              <Card variant="outlined" sx={{ height: "100%" }}>
                <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    {feature.icon}
                    <Box>
                      <Typography variant="body2" fontWeight={600}>
                        {feature.label}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {feature.desc}
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>
    </Box>
  );
};

import useExecutionTimeStore from "../../stores/ExecutionTimeStore";
import useStatusStore from "../../stores/StatusStore";

export default PerformanceDemo;
