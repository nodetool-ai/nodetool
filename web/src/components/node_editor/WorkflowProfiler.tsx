/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useEffect, useCallback } from "react";
import { Box, Button, Card, CardContent, Chip, LinearProgress, Typography, Tooltip } from "@mui/material";
import { useWorkflowProfiler, UseWorkflowProfilerReturn } from "../../hooks/useWorkflowProfiler";
import { useNodes } from "../../contexts/NodeContext";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { Node, Edge } from "@xyflow/react";
import { Bottleneck } from "../../stores/WorkflowProfilerStore";

const styles = {
  container: css`
    padding: 16px;
    height: 100%;
    overflow-y: auto;
  `,
  header: css`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  `,
  metricCard: css`
    margin-bottom: 12px;
  `,
  metricRow: css`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  `,
  progressBar: css`
    height: 8px;
    border-radius: 4px;
    margin-top: 4px;
  `,
  bottleneckCard: css`
    margin-top: 12px;
    border-left: 4px solid;
  `,
  suggestionChip: css`
    margin: 4px 4px 4px 0;
  `,
  section: css`
    margin-bottom: 20px;
  `,
  complexityIndicator: css`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px;
    border-radius: 8px;
    background-color: var(--mui-palette-background-default);
    margin-bottom: 16px;
  `
};

const ComplexityIndicator = memo(function ComplexityIndicator({ 
  score, 
  getColor 
}: { 
  score: number; 
  getColor: (s: number) => string 
}) {
  const maxScore = 150;
  const percentage = Math.min((score / maxScore) * 100, 100);
  const color = getColor(score);
  
  const getLabel = (s: number): string => {
    if (s < 30) { return "Low Complexity"; }
    if (s < 70) { return "Moderate Complexity"; }
    if (s < 100) { return "High Complexity"; }
    return "Very High Complexity";
  };

  return (
    <Box css={styles.complexityIndicator}>
      <Box sx={{ flex: 1 }}>
        <Box css={styles.metricRow}>
          <Typography variant="subtitle2">{getLabel(score)}</Typography>
          <Typography variant="body2" sx={{ color: color, fontWeight: "bold" }}>
            {score.toFixed(0)}
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={percentage}
          sx={{ 
            height: 8, 
            borderRadius: 4,
            backgroundColor: "var(--mui-palette-divider)",
            "& .MuiLinearProgress-bar": {
              backgroundColor: color
            }
          }}
        />
      </Box>
    </Box>
  );
});

const MetricCard = memo(function MetricCard({ 
  title, 
  metrics 
}: { 
  title: string; 
  metrics: Array<{ label: string; value: number | string; color?: string }>
}) {
  return (
    <Card css={styles.metricCard} variant="outlined">
      <CardContent>
        <Typography variant="subtitle2" sx={{ mb: 1, color: "text.secondary" }}>
          {title}
        </Typography>
        {metrics.map((metric, index) => (
          <Box key={index} css={styles.metricRow}>
            <Typography variant="body2">{metric.label}</Typography>
            <Typography 
              variant="body2" 
              sx={{ fontWeight: "bold", color: metric.color || "text.primary" }}
            >
              {metric.value}
            </Typography>
          </Box>
        ))}
      </CardContent>
    </Card>
  );
});

const BottleneckCard = memo(function BottleneckCard({ 
  bottleneck, 
  getSeverityColor 
}: { 
  bottleneck: Bottleneck;
  getSeverityColor: (s: "high" | "medium" | "low") => string;
}) {
  const severityColor = getSeverityColor(bottleneck.severity);

  return (
    <Card 
      css={styles.bottleneckCard} 
      variant="outlined"
      sx={{ borderLeftColor: severityColor }}
    >
      <CardContent>
        <Box css={styles.metricRow}>
          <Typography variant="subtitle2">{bottleneck.nodeType}</Typography>
          <Chip 
            label={bottleneck.severity.toUpperCase()} 
            size="small"
            sx={{ 
              backgroundColor: severityColor,
              color: "white",
              fontWeight: "bold",
              fontSize: "0.7rem"
            }}
          />
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {bottleneck.reason}
        </Typography>
        <Typography variant="body2" sx={{ fontStyle: "italic", color: "text.secondary" }}>
          💡 {bottleneck.suggestion}
        </Typography>
      </CardContent>
    </Card>
  );
});

const EmptyState = () => (
  <Box css={styles.container}>
    <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", mt: 4 }}>
      No workflow to analyze. Add some nodes to get started.
    </Typography>
  </Box>
);

const InitialState = ({ onAnalyze }: { onAnalyze: () => void }) => (
  <Box sx={{ textAlign: "center", mt: 4 }}>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
      Click &quot;Analyze&quot; to profile this workflow
    </Typography>
    <Button variant="contained" onClick={onAnalyze}>
      Analyze Workflow
    </Button>
  </Box>
);

const WorkflowProfilerComponent = memo(function WorkflowProfilerComponent() {
  const { 
    profile, 
    isAnalyzing, 
    analyzeWorkflow, 
    clearProfile, 
    getComplexityColor, 
    getSeverityColor 
  }: UseWorkflowProfilerReturn = useWorkflowProfiler();

  const nodes: Node[] = useNodes((state) => state.nodes);
  const edges: Edge[] = useNodes((state) => state.edges);

  const { currentWorkflowId } = useWorkflowManager((state) => ({
    currentWorkflowId: state.currentWorkflowId
  }));

  const workflowId = currentWorkflowId || "unknown";

  const handleAnalyze = useCallback(() => {
    if (nodes.length > 0) {
      analyzeWorkflow(nodes, edges, workflowId);
    }
  }, [nodes, edges, workflowId, analyzeWorkflow]);

  const handleClear = useCallback(() => {
    clearProfile();
  }, [clearProfile]);

  useEffect(() => {
    if (!profile && nodes.length > 0 && !isAnalyzing) {
      analyzeWorkflow(nodes, edges, workflowId);
    }
  }, [nodes, edges, workflowId, profile, isAnalyzing, analyzeWorkflow]);

  if (nodes.length === 0) {
    return <EmptyState />;
  }

  return (
    <Box css={styles.container}>
      <Box css={styles.header}>
        <Typography variant="h6">Workflow Profiler</Typography>
        <Box>
          <Tooltip title="Analyze current workflow">
            <span>
              <Button 
                variant="outlined" 
                size="small" 
                onClick={handleAnalyze}
                disabled={isAnalyzing || nodes.length === 0}
                sx={{ mr: 1 }}
              >
                {isAnalyzing ? "Analyzing..." : "Analyze"}
              </Button>
            </span>
          </Tooltip>
          <Tooltip title="Clear analysis">
            <span>
              <Button 
                variant="text" 
                size="small" 
                onClick={handleClear}
                disabled={!profile}
              >
                Clear
              </Button>
            </span>
          </Tooltip>
        </Box>
      </Box>

      {isAnalyzing && <LinearProgress sx={{ mb: 2 }} />}

      {profile && (
        <>
          <ComplexityIndicator score={profile.complexityScore} getColor={getComplexityColor} />

          <Box css={styles.section}>
            <MetricCard 
              title="Structure Analysis"
              metrics={[
                { label: "Total Nodes", value: profile.nodeCount },
                { label: "Total Connections", value: profile.edgeCount },
                { label: "Critical Path Length", value: `${profile.maxDepth} nodes` },
                { label: "Branching Factor", value: profile.metrics.branchingFactor.toFixed(2) },
                { label: "Est. Runtime", value: `${profile.estimatedRuntime}ms` }
              ]}
            />
          </Box>

          <Box css={styles.section}>
            <MetricCard 
              title="Node Distribution"
              metrics={[
                { label: "Input Nodes", value: profile.metrics.inputNodes, color: "#2196f3" },
                { label: "Output Nodes", value: profile.metrics.outputNodes, color: "#4caf50" },
                { label: "Processing Nodes", value: profile.metrics.processingNodes, color: "#ff9800" }
              ]}
            />
          </Box>

          {profile.bottlenecks.length > 0 && (
            <Box css={styles.section}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Detected Bottlenecks ({profile.bottlenecks.length})
              </Typography>
              {profile.bottlenecks.map((bottleneck: Bottleneck) => (
                <BottleneckCard 
                  key={bottleneck.nodeId} 
                  bottleneck={bottleneck} 
                  getSeverityColor={getSeverityColor}
                />
              ))}
            </Box>
          )}

          <Box css={styles.section}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Optimization Suggestions
            </Typography>
            <Box>
              {profile.suggestions.map((suggestion: string) => (
                <Chip
                  key={suggestion}
                  label={suggestion}
                  css={styles.suggestionChip}
                  variant="outlined"
                  size="small"
                />
              ))}
            </Box>
          </Box>

          <Box css={styles.section}>
            <Typography variant="caption" color="text.secondary">
              Last analyzed: {new Date(profile.timestamp).toLocaleString()}
            </Typography>
          </Box>
        </>
      )}

      {!profile && !isAnalyzing && (
        <InitialState onAnalyze={handleAnalyze} />
      )}
    </Box>
  );
});

export default WorkflowProfilerComponent;
