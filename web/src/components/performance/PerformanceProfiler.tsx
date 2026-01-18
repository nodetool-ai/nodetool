import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  LinearProgress,
  Chip,
  IconButton,
  Collapse,
  useTheme,
  alpha
} from '@mui/material';
import {
  Speed as SpeedIcon,
  Timer as TimerIcon,
  Lightbulb as LightbulbIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  CheckCircle as CheckCircleIcon,
  Refresh as RefreshIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Memory as MemoryIcon
} from '@mui/icons-material';
import { useNodes } from '../../contexts/NodeContext';
import useExecutionTimeStore from '../../stores/ExecutionTimeStore';
import useResultsStore from '../../stores/ResultsStore';
import { useWebsocketRunner } from '../../stores/WorkflowRunner';

interface ProfilerNodeData {
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  duration: number | undefined;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startTime: number | undefined;
  endTime: number | undefined;
  position: number;
}

interface ProfilerStats {
  totalDuration: number;
  nodeCount: number;
  completedCount: number;
  failedCount: number;
  averageDuration: number;
  slowestNode: ProfilerNodeData | null;
  fastestNode: ProfilerNodeData | null;
}

interface BottleneckInfo {
  nodeId: string;
  nodeLabel: string;
  nodeType: string;
  duration: number;
  percentage: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  suggestion: string;
}

interface OptimizationSuggestion {
  type: 'parallel' | 'sequential' | 'model' | 'input' | 'general';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  effort: 'easy' | 'medium' | 'hard';
}

interface PerformanceProfile {
  workflowId: string;
  timestamp: number;
  stats: ProfilerStats;
  nodes: ProfilerNodeData[];
  bottlenecks: BottleneckInfo[];
  suggestions: OptimizationSuggestion[];
}

interface PerformanceProfilerProps {
  workflowId: string;
  compact?: boolean;
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
};

const getSeverityColor = (severity: BottleneckInfo['severity'], theme: any): string => {
  switch (severity) {
    case 'critical': return theme.palette.error.main;
    case 'high': return theme.palette.warning.main;
    case 'medium': return theme.palette.info.main;
    case 'low': return theme.palette.success.main;
  }
};

const NodeTimelineBar: React.FC<{
  node: ProfilerNodeData;
  maxDuration: number;
  maxStartTime: number;
  onClick: () => void;
}> = ({ node, maxDuration, maxStartTime, onClick }) => {
  const theme = useTheme();
  const barWidth = maxDuration > 0 ? ((node.duration || 0) / maxDuration) * 100 : 0;
  const startOffset = maxStartTime > 0 && node.startTime 
    ? ((node.startTime - maxStartTime) / maxDuration) * 100 
    : 0;

  const getStatusColor = (): string => {
    switch (node.status) {
      case 'completed': return theme.palette.success.main;
      case 'failed': return theme.palette.error.main;
      case 'running': return theme.palette.primary.main;
      default: return theme.palette.grey[400];
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        py: 0.5,
        cursor: 'pointer',
        '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.05) },
        borderRadius: 1,
        px: 1
      }}
      onClick={onClick}
    >
      <Box sx={{ width: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        <Typography variant="caption" noWrap title={node.nodeLabel}>
          {node.nodeLabel}
        </Typography>
      </Box>
      <Box sx={{ flex: 1, position: 'relative', height: 24 }}>
        <Box
          sx={{
            position: 'absolute',
            left: `${Math.max(0, startOffset)}%`,
            width: `${Math.max(1, barWidth)}%`,
            height: 16,
            bgcolor: getStatusColor(),
            borderRadius: 1,
            minWidth: 2
          }}
        />
      </Box>
      <Box sx={{ width: 60, textAlign: 'right' }}>
        <Typography variant="caption">
          {node.duration ? formatDuration(node.duration) : '--'}
        </Typography>
      </Box>
    </Box>
  );
};

const BottleneckCard: React.FC<{ bottleneck: BottleneckInfo }> = ({ bottleneck }) => {
  const theme = useTheme();
  const color = getSeverityColor(bottleneck.severity, theme);

  return (
    <Paper
      elevation={0}
      sx={{
        p: 1.5,
        border: `1px solid ${alpha(color, 0.3)}`,
        borderLeft: `4px solid ${color}`,
        borderRadius: 1,
        mb: 1
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="subtitle2">{bottleneck.nodeLabel}</Typography>
          <Typography variant="caption" color="text.secondary">
            {bottleneck.nodeType}
          </Typography>
        </Box>
        <Chip
          label={`${bottleneck.percentage}%`}
          size="small"
          sx={{ bgcolor: alpha(color, 0.1), color, fontWeight: 'bold' }}
        />
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
        <TimerIcon fontSize="small" color="action" />
        <Typography variant="body2">{formatDuration(bottleneck.duration)}</Typography>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
        {bottleneck.suggestion}
      </Typography>
    </Paper>
  );
};

const SuggestionCard: React.FC<{ suggestion: OptimizationSuggestion }> = ({ suggestion }) => {
  const theme = useTheme();

  return (
    <Paper
      elevation={0}
      sx={{
        p: 1.5,
        border: `1px solid ${alpha(theme.palette.info.main, 0.3)}`,
        borderRadius: 1,
        mb: 1
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <LightbulbIcon fontSize="small" color="info" />
        <Typography variant="subtitle2">{suggestion.title}</Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {suggestion.description}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Chip
          label={`Impact: ${suggestion.impact}`}
          size="small"
          color={suggestion.impact === 'high' ? 'error' : suggestion.impact === 'medium' ? 'warning' : 'default'}
          variant="outlined"
        />
        <Chip
          label={`Effort: ${suggestion.effort}`}
          size="small"
          variant="outlined"
        />
      </Box>
    </Paper>
  );
};

interface StatsType {
  totalDuration: number;
  nodeCount: number;
  completedCount: number;
  failedCount: number;
  averageDuration: number;
  slowestNode: ProfilerNodeData | null;
  fastestNode: ProfilerNodeData | null;
}

const PerformanceStats: React.FC<{ stats: StatsType }> = ({ stats }) => {
  const theme = useTheme();

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 2, mb: 2 }}>
      <Paper elevation={0} sx={{ p: 1.5, bgcolor: alpha(theme.palette.primary.main, 0.05) }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <TimerIcon fontSize="small" color="primary" />
          <Typography variant="caption" color="text.secondary">Total Time</Typography>
        </Box>
        <Typography variant="h6">{formatDuration(stats.totalDuration)}</Typography>
      </Paper>

      <Paper elevation={0} sx={{ p: 1.5, bgcolor: alpha(theme.palette.success.main, 0.05) }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <CheckCircleIcon fontSize="small" color="success" />
          <Typography variant="caption" color="text.secondary">Completed</Typography>
        </Box>
        <Typography variant="h6">{stats.completedCount} / {stats.nodeCount}</Typography>
      </Paper>

      <Paper elevation={0} sx={{ p: 1.5, bgcolor: alpha(theme.palette.error.main, 0.05) }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <ErrorIcon fontSize="small" color="error" />
          <Typography variant="caption" color="text.secondary">Failed</Typography>
        </Box>
        <Typography variant="h6">{stats.failedCount}</Typography>
      </Paper>

      <Paper elevation={0} sx={{ p: 1.5, bgcolor: alpha(theme.palette.info.main, 0.05) }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <SpeedIcon fontSize="small" color="info" />
          <Typography variant="caption" color="text.secondary">Average</Typography>
        </Box>
        <Typography variant="h6">{formatDuration(stats.averageDuration)}</Typography>
      </Paper>
    </Box>
  );
};

const PerformanceProfiler: React.FC<PerformanceProfilerProps> = ({
  workflowId,
  compact = false
}) => {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(true);
  const [showBottlenecks, setShowBottlenecks] = useState(true);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [profile, setProfile] = useState<PerformanceProfile | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const nodes = useNodes(state => state.nodes);
  const timings = useExecutionTimeStore(state => state.timings);
  const edges = useResultsStore(state => state.edges);
  const runnerState = useWebsocketRunner(state => state.state);

  const calculateDuration = useCallback((nodeId: string): number | undefined => {
    const key = `${workflowId}:${nodeId}`;
    const timing = timings[key];
    if (timing && timing.endTime) {
      return timing.endTime - timing.startTime;
    }
    return undefined;
  }, [workflowId, timings]);

  const getStatus = useCallback((nodeId: string): ProfilerNodeData['status'] => {
    const edgeKey = `${workflowId}:${nodeId}`;
    const edge = edges[edgeKey];
    if (!edge) return 'pending';
    
    switch (edge.status) {
      case 'running': return 'running';
      case 'completed': return 'completed';
      case 'failed': return 'failed';
      case 'cancelled': return 'cancelled';
      default: return 'pending';
    }
  }, [workflowId, edges]);

  const analyzeWorkflow = useCallback(() => {
    setIsAnalyzing(true);

    const profilerNodes: ProfilerNodeData[] = nodes.map((node, index) => {
      const duration = calculateDuration(node.id);
      const timing = timings[`${workflowId}:${node.id}`];
      
      return {
        nodeId: node.id,
        nodeType: node.type || 'unknown',
        nodeLabel: node.data.title || node.type || 'Unknown Node',
        duration,
        status: getStatus(node.id),
        startTime: timing?.startTime,
        endTime: timing?.endTime,
        position: index
      };
    });

    const completedNodes = profilerNodes.filter(n => n.status === 'completed' && n.duration !== undefined);
    const durations = completedNodes.map(n => n.duration as number);

    const totalDuration = durations.length > 0
      ? Math.max(...durations.map((d, i) => d + (completedNodes[i].startTime || 0))) - 
        Math.min(...completedNodes.map(n => n.startTime || 0))
      : 0;

    const avgDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    const sortedByDuration = [...completedNodes].sort((a, b) => 
      (b.duration || 0) - (a.duration || 0)
    );

    const stats: StatsType = {
      totalDuration,
      nodeCount: profilerNodes.length,
      completedCount: completedNodes.length,
      failedCount: profilerNodes.filter(n => n.status === 'failed').length,
      averageDuration: avgDuration,
      slowestNode: sortedByDuration[0] || null,
      fastestNode: sortedByDuration[sortedByDuration.length - 1] || null
    };

    const totalNodeDuration = completedNodes.reduce(
      (sum, n) => sum + (n.duration || 0), 0
    );

    const bottlenecks = completedNodes
      .filter(n => {
        const percentage = totalNodeDuration > 0 
          ? ((n.duration || 0) / totalNodeDuration) * 100 
          : 0;
        return percentage >= 10;
      })
      .map(n => {
        const percentage = totalNodeDuration > 0 
          ? ((n.duration || 0) / totalNodeDuration) * 100 
          : 0;

        let severity: BottleneckInfo['severity'];
        if (percentage >= 50) severity = 'critical';
        else if (percentage >= 30) severity = 'high';
        else if (percentage >= 15) severity = 'medium';
        else severity = 'low';

        let suggestion = '';
        if (n.nodeType.includes('llm') || n.nodeType.includes('model')) {
          suggestion = 'Consider using a smaller model or caching results for repeated queries.';
        } else if (n.nodeType.includes('image') || n.nodeType.includes('vision')) {
          suggestion = 'Try reducing image resolution or using batch processing.';
        } else if (n.nodeType.includes('audio') || n.nodeType.includes('transcribe')) {
          suggestion = 'Consider preprocessing audio files to reduce duration.';
        } else {
          suggestion = 'Review node configuration for optimization opportunities.';
        }

        return {
          nodeId: n.nodeId,
          nodeLabel: n.nodeLabel,
          nodeType: n.nodeType,
          duration: n.duration || 0,
          percentage: Math.round(percentage * 10) / 10,
          severity,
          suggestion
        };
      })
      .sort((a, b) => b.percentage - a.percentage);

    const suggestions: OptimizationSuggestion[] = [];

    if (bottlenecks.length > 0 && bottlenecks[0].percentage > 40) {
      suggestions.push({
        type: 'model',
        title: 'Consider model optimization',
        description: `The node "${bottlenecks[0].nodeLabel}" takes ${bottlenecks[0].percentage}% of total execution time.`,
        impact: 'high',
        effort: 'medium'
      });
    }

    const hasMultipleLLMNodes = profilerNodes.some(
      n => n.nodeType.includes('llm') || n.nodeType.includes('model')
    );

    if (hasMultipleLLMNodes) {
      suggestions.push({
        type: 'parallel',
        title: 'Parallelize independent LLM calls',
        description: 'If multiple LLM nodes run independently, consider restructuring for parallel execution.',
        impact: 'high',
        effort: 'hard'
      });
    }

    const slowNodes = profilerNodes.filter(
      n => n.duration !== undefined && n.duration > 10000
    );

    if (slowNodes.length > 2) {
      suggestions.push({
        type: 'general',
        title: 'Review slow node configurations',
        description: `${slowNodes.length} nodes take more than 10 seconds. Check for unnecessary processing.`,
        impact: 'medium',
        effort: 'easy'
      });
    }

    const newProfile: PerformanceProfile = {
      workflowId,
      timestamp: Date.now(),
      stats,
      nodes: profilerNodes,
      bottlenecks,
      suggestions
    };

    setProfile(newProfile);
    setIsAnalyzing(false);
  }, [workflowId, nodes, timings, edges, calculateDuration, getStatus]);

  useEffect(() => {
    if (workflowId && runnerState !== 'running') {
      analyzeWorkflow();
    }
  }, [workflowId, runnerState, analyzeWorkflow]);

  const timelineData = useMemo(() => {
    if (!profile) return { nodes: [], maxDuration: 1000, maxStartTime: 0 };

    const completedNodes = profile.nodes.filter(
      (n: ProfilerNodeData) => n.startTime !== undefined && n.duration !== undefined
    );

    if (completedNodes.length === 0) {
      return { nodes: profile.nodes, maxDuration: 1000, maxStartTime: 0 };
    }

    const maxStartTime = Math.min(...completedNodes.map((n: ProfilerNodeData) => n.startTime!));
    const maxDuration = Math.max(...completedNodes.map((n: ProfilerNodeData) => n.startTime! + n.duration!)) - maxStartTime;

    return {
      nodes: profile.nodes,
      maxDuration: Math.max(maxDuration, 1000),
      maxStartTime
    };
  }, [profile]);

  if (compact) {
    return (
      <Box sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SpeedIcon color="primary" />
            <Typography variant="h6">Performance</Typography>
          </Box>
          <Button
            size="small"
            onClick={analyzeWorkflow}
            disabled={isAnalyzing || runnerState === 'running'}
            startIcon={<RefreshIcon />}
          >
            Analyze
          </Button>
        </Box>

        {isAnalyzing && <LinearProgress sx={{ mb: 2 }} />}

        {profile && (
          <>
            <PerformanceStats stats={profile.stats} />

            {profile.bottlenecks.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                  <WarningIcon fontSize="small" color="warning" />
                  Bottlenecks ({profile.bottlenecks.length})
                </Typography>
                {profile.bottlenecks.slice(0, 2).map((b: BottleneckInfo) => (
                  <BottleneckCard key={b.nodeId} bottleneck={b} />
                ))}
              </Box>
            )}
          </>
        )}

        {!profile && !isAnalyzing && (
          <Typography color="text.secondary" variant="body2">
            Run a workflow to see performance analysis.
          </Typography>
        )}
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2, height: '100%', overflow: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SpeedIcon color="primary" />
          <Typography variant="h6">Performance Profiler</Typography>
          {profile && (
            <Typography variant="caption" color="text.secondary">
              Last run: {new Date(profile.timestamp).toLocaleTimeString()}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            size="small"
            onClick={analyzeWorkflow}
            disabled={isAnalyzing || runnerState === 'running'}
            startIcon={<RefreshIcon />}
          >
            {isAnalyzing ? 'Analyzing...' : 'Analyze'}
          </Button>
          <IconButton size="small" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        </Box>
      </Box>

      {isAnalyzing && <LinearProgress sx={{ mb: 2 }} />}

      <Collapse in={expanded}>
        {profile ? (
          <>
            <PerformanceStats stats={profile.stats} />

            <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 3, mb: 1 }}>
              <MemoryIcon fontSize="small" />
              Execution Timeline
            </Typography>
            <Paper variant="outlined" sx={{ p: 1, mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, pb: 1, borderBottom: 1, borderColor: 'divider' }}>
                <Box sx={{ width: 120 }} />
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="caption" color="text.secondary">0ms</Typography>
                    <Typography variant="caption" color="text.secondary">{formatDuration(timelineData.maxDuration)}</Typography>
                  </Box>
                </Box>
                <Box sx={{ width: 60 }} />
              </Box>
              {timelineData.nodes.map((node: ProfilerNodeData) => (
                <NodeTimelineBar
                  key={node.nodeId}
                  node={node}
                  maxDuration={timelineData.maxDuration}
                  maxStartTime={timelineData.maxStartTime}
                  onClick={() => {}}
                />
              ))}
            </Paper>

            {profile.bottlenecks.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Box
                  sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                  onClick={() => setShowBottlenecks(!showBottlenecks)}
                >
                  <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <WarningIcon fontSize="small" color="warning" />
                    Bottlenecks ({profile.bottlenecks.length})
                  </Typography>
                  {showBottlenecks ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </Box>
                <Collapse in={showBottlenecks}>
                  {profile.bottlenecks.map((b: BottleneckInfo) => (
                    <BottleneckCard key={b.nodeId} bottleneck={b} />
                  ))}
                </Collapse>
              </Box>
            )}

            {profile.suggestions.length > 0 && (
              <Box>
                <Box
                  sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                  onClick={() => setShowSuggestions(!showSuggestions)}
                >
                  <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <LightbulbIcon fontSize="small" color="info" />
                    Optimization Suggestions ({profile.suggestions.length})
                  </Typography>
                  {showSuggestions ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </Box>
                <Collapse in={showSuggestions}>
                  {profile.suggestions.map((s: OptimizationSuggestion, i: number) => (
                    <SuggestionCard key={i} suggestion={s} />
                  ))}
                </Collapse>
              </Box>
            )}
          </>
        ) : (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <SpeedIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
            <Typography variant="body1" color="text.secondary" gutterBottom>
              No performance data yet
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Run a workflow to see execution time analysis
            </Typography>
            <Button
              variant="outlined"
              onClick={analyzeWorkflow}
              disabled={runnerState === 'running'}
            >
              Analyze Current Run
            </Button>
          </Box>
        )}
      </Collapse>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spinning {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </Box>
  );
};

export default PerformanceProfiler;
