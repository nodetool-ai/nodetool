import React from 'react';
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Paper,
  Chip,
  LinearProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tooltip,
  IconButton,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Refresh as RefreshIcon,
  TrendingUp as TrendingUpIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  Error as ErrorIcon,
  Speed as SpeedIcon,
  Memory as MemoryIcon,
  Timeline as TimelineIcon,
  Lightbulb as LightbulbIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { useWorkflowProfiler } from '../../hooks/useWorkflowProfiler';
import { Node, Edge } from '@xyflow/react';

interface WorkflowProfilerPanelProps {
  workflowId?: string;
  onNodeSelect?: (nodeId: string) => void;
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) {return `${ms}ms`;}
  if (ms < 60000) {return `${(ms / 1000).toFixed(1)}s`;}
  return `${Math.floor(ms / 60000)}m ${((ms % 60000) / 1000).toFixed(0)}s`;
};

const getSeverityColor = (severity: 'info' | 'warning' | 'error'): string => {
  switch (severity) {
    case 'error':
      return 'error.main';
    case 'warning':
      return 'warning.main';
    default:
      return 'info.main';
  }
};

const getSeverityIcon = (severity: 'info' | 'warning' | 'error') => {
  switch (severity) {
    case 'error':
      return <ErrorIcon fontSize="small" color="error" />;
    case 'warning':
      return <WarningIcon fontSize="small" color="warning" />;
    default:
      return <InfoIcon fontSize="small" color="info" />;
  }
};

const getImpactColor = (impact: 'high' | 'medium' | 'low'): 'error' | 'warning' | 'success' | 'default' => {
  switch (impact) {
    case 'high':
      return 'error';
    case 'medium':
      return 'warning';
    case 'low':
      return 'success';
    default:
      return 'default';
  }
};

const ComplexityBar: React.FC<{ value: number; max?: number }> = ({ value, max = 10 }) => {
  const theme = useTheme();
  const percentage = Math.min((value / max) * 100, 100);

  const getColor = () => {
    if (percentage > 70) {return theme.vars.palette.error.main;}
    if (percentage > 40) {return theme.vars.palette.warning.main;}
    return theme.vars.palette.success.main;
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <LinearProgress
        variant="determinate"
        value={percentage}
        sx={{
          flex: 1,
          height: 8,
          borderRadius: 4,
          backgroundColor: theme.vars.palette.action.hover,
          '& .MuiLinearProgress-bar': {
            backgroundColor: getColor(),
            borderRadius: 4,
          },
        }}
      />
      <Typography variant="caption" sx={{ minWidth: 30, fontWeight: 500 }}>
        {value.toFixed(1)}
      </Typography>
    </Box>
  );
};

export const WorkflowProfilerPanel: React.FC<WorkflowProfilerPanelProps> = ({
  workflowId: propWorkflowId,
  onNodeSelect,
}) => {
  const theme = useTheme();
  const [nodes, setNodes] = React.useState<Node[]>([]);
  const [edges, setEdges] = React.useState<Edge[]>([]);

  const {
    isAnalyzing,
    lastAnalyzedAt,
    workflowMetrics,
    issues,
    suggestions,
    expandedSections,
    startAnalysis,
    toggleSection,
  } = useWorkflowProfiler();

  const handleAnalyze = React.useCallback(() => {
    if (propWorkflowId && nodes.length > 0) {
      startAnalysis(propWorkflowId, nodes, edges);
    }
  }, [propWorkflowId, nodes, edges, startAnalysis]);

  const handleNodeClick = (nodeId: string) => {
    if (onNodeSelect) {
      onNodeSelect(nodeId);
    }
  };

  const timeSinceLastAnalysis = lastAnalyzedAt
    ? Math.floor((Date.now() - lastAnalyzedAt) / 1000)
    : null;

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          p: 2,
          borderBottom: `1px solid ${theme.vars.palette.divider}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: theme.vars.palette.background.default,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SpeedIcon color="primary" />
          <Typography variant="subtitle1" fontWeight={600}>
            Workflow Profiler
          </Typography>
        </Box>
        <Tooltip title="Re-analyze workflow">
          <span>
            <IconButton
              size="small"
              onClick={handleAnalyze}
              disabled={isAnalyzing}
            >
              {isAnalyzing ? (
                <CircularProgress size={18} />
              ) : (
                <RefreshIcon fontSize="small" />
              )}
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {!workflowMetrics && !isAnalyzing && (
          <Paper
            sx={{
              p: 3,
              textAlign: 'center',
              backgroundColor: theme.vars.palette.background.paper,
            }}
          >
            <SpeedIcon
              sx={{ fontSize: 48, color: theme.vars.palette.text.secondary, mb: 1 }}
            />
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Analyze your workflow to identify performance bottlenecks and optimization opportunities.
            </Typography>
            <Button
              variant="contained"
              onClick={handleAnalyze}
              startIcon={<RefreshIcon />}
            >
              Analyze Workflow
            </Button>
          </Paper>
        )}

        {isAnalyzing && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <CircularProgress sx={{ mb: 2 }} />
            <Typography variant="body2" color="text.secondary">
              Analyzing workflow structure...
            </Typography>
          </Box>
        )}

        {workflowMetrics && !isAnalyzing && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {lastAnalyzedAt && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ textAlign: 'right' }}
              >
                Last analyzed {timeSinceLastAnalysis}s ago
              </Typography>
            )}

            <Accordion
              expanded={expandedSections.overview}
              onChange={() => toggleSection('overview')}
              sx={{
                '&:before': { display: 'none' },
                boxShadow: 'none',
                border: `1px solid ${theme.vars.palette.divider}`,
                borderRadius: 1,
              }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <TimelineIcon fontSize="small" />
                  <Typography fontWeight={500}>Overview</Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                  <Paper
                    sx={{
                      p: 2,
                      backgroundColor: theme.vars.palette.action.hover,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        Nodes
                      </Typography>
                    </Box>
                    <Typography variant="h5" fontWeight={600}>
                      {workflowMetrics.totalNodes}
                    </Typography>
                  </Paper>

                  <Paper
                    sx={{
                      p: 2,
                      backgroundColor: theme.vars.palette.action.hover,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        Connections
                      </Typography>
                    </Box>
                    <Typography variant="h5" fontWeight={600}>
                      {workflowMetrics.totalEdges}
                    </Typography>
                  </Paper>

                  <Paper
                    sx={{
                      p: 2,
                      backgroundColor: theme.vars.palette.action.hover,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        Est. Runtime
                      </Typography>
                    </Box>
                    <Typography variant="h5" fontWeight={600}>
                      {formatDuration(workflowMetrics.estimatedTotalRuntime)}
                    </Typography>
                  </Paper>

                  <Paper
                    sx={{
                      p: 2,
                      backgroundColor: theme.vars.palette.action.hover,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        Max Parallelism
                      </Typography>
                    </Box>
                    <Typography variant="h5" fontWeight={600}>
                      {workflowMetrics.maxParallelism}
                    </Typography>
                  </Paper>
                </Box>

                <Box sx={{ mt: 2 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                    Complexity Score
                  </Typography>
                  <ComplexityBar value={workflowMetrics.complexityScore} max={100} />
                </Box>

                <Box sx={{ mt: 2 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                    Memory Footprint
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <MemoryIcon fontSize="small" color="action" />
                    <Typography variant="body2">
                      {(workflowMetrics.memoryFootprint / 1024).toFixed(1)} MB
                    </Typography>
                  </Box>
                </Box>
              </AccordionDetails>
            </Accordion>

            {workflowMetrics.bottlenecks.length > 0 && (
              <Accordion
                expanded={expandedSections.bottlenecks}
                onChange={() => toggleSection('bottlenecks')}
                sx={{
                  '&:before': { display: 'none' },
                  boxShadow: 'none',
                  border: `1px solid ${theme.vars.palette.divider}`,
                  borderRadius: 1,
                }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <WarningIcon fontSize="small" color="warning" />
                    <Typography fontWeight={500}>Bottlenecks</Typography>
                    <Chip
                      label={workflowMetrics.bottlenecks.length}
                      size="small"
                      color="warning"
                      sx={{ ml: 1 }}
                    />
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  {workflowMetrics.bottlenecks.map(nodeId => (
                    <Paper
                      key={nodeId}
                      sx={{
                        p: 1.5,
                        mb: 1,
                        cursor: 'pointer',
                        '&:hover': {
                          backgroundColor: theme.vars.palette.action.hover,
                        },
                      }}
                      onClick={() => handleNodeClick(nodeId)}
                    >
                      <Typography variant="body2" fontWeight={500}>
                        Node: {nodeId}
                      </Typography>
                    </Paper>
                  ))}
                </AccordionDetails>
              </Accordion>
            )}

            {suggestions.length > 0 && (
              <Accordion
                expanded={expandedSections.suggestions}
                onChange={() => toggleSection('suggestions')}
                sx={{
                  '&:before': { display: 'none' },
                  boxShadow: 'none',
                  border: `1px solid ${theme.vars.palette.divider}`,
                  borderRadius: 1,
                }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <LightbulbIcon fontSize="small" color="primary" />
                    <Typography fontWeight={500}>Suggestions</Typography>
                    <Chip
                      label={suggestions.length}
                      size="small"
                      color="primary"
                      sx={{ ml: 1 }}
                    />
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    {suggestions.map(suggestion => (
                      <Paper
                        key={suggestion.id}
                        sx={{
                          p: 2,
                          borderLeft: `3px solid ${theme.vars.palette[getImpactColor(suggestion.impact)].main}`,
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                          <Typography variant="subtitle2" fontWeight={600}>
                            {suggestion.title}
                          </Typography>
                          <Chip
                            label={`-${suggestion.estimatedImprovement}%`}
                            size="small"
                            color={getImpactColor(suggestion.impact)}
                            sx={{ fontSize: '0.7rem' }}
                          />
                        </Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                          {suggestion.description}
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <TrendingUpIcon fontSize="small" color="action" />
                          <Typography variant="caption" color="text.secondary">
                            Impact: {suggestion.impact}
                          </Typography>
                        </Box>
                      </Paper>
                    ))}
                  </Box>
                </AccordionDetails>
              </Accordion>
            )}

            {issues.length > 0 && (
              <Accordion
                expanded={expandedSections.issues}
                onChange={() => toggleSection('issues')}
                sx={{
                  '&:before': { display: 'none' },
                  boxShadow: 'none',
                  border: `1px solid ${theme.vars.palette.divider}`,
                  borderRadius: 1,
                }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <InfoIcon fontSize="small" />
                    <Typography fontWeight={500}>Issues ({issues.length})</Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {issues.map(issue => (
                      <Paper
                        key={issue.id}
                        sx={{
                          p: 1.5,
                          display: 'flex',
                          gap: 1,
                        }}
                      >
                        {getSeverityIcon(issue.severity)}
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="body2" fontWeight={500}>
                            {issue.message}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {issue.suggestion}
                          </Typography>
                        </Box>
                      </Paper>
                    ))}
                  </Box>
                </AccordionDetails>
              </Accordion>
            )}

            {suggestions.length === 0 && issues.length === 0 && workflowMetrics && (
              <Paper
                sx={{
                  p: 3,
                  textAlign: 'center',
                  backgroundColor: theme.vars.palette.success.light,
                }}
              >
                <CheckCircleIcon
                  sx={{ fontSize: 48, color: theme.vars.palette.success.main, mb: 1 }}
                />
                <Typography variant="subtitle1" fontWeight={600}>
                  Workflow looks good!
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  No significant issues detected.
                </Typography>
              </Paper>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default WorkflowProfilerPanel;
