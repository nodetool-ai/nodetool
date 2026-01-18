import React, { useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Button,
  LinearProgress,
  Paper,
  Chip,
  Tooltip,
  IconButton,
  Collapse,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Theme,
} from '@mui/material';
import {
  Speed as SpeedIcon,
  Memory as MemoryIcon,
  Timeline as TimelineIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Refresh as RefreshIcon,
  Info as InfoIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Timer as TimerIcon,
  Storage as StorageIcon,
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { usePerformanceProfileStore, NodePerformanceMetrics, WorkflowProfile } from '../../stores/PerformanceProfileStore';

interface PerformanceProfilerProps {
  workflowId: string;
  nodes: Array<{ id: string; type: string; data: Record<string, unknown> }>;
  edges: Array<{ source: string; target: string }>;
  onAnalyze?: (profile: WorkflowProfile) => void;
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) {return `${ms}ms`;}
  if (ms < 60000) {return `${(ms / 1000).toFixed(1)}s`;}
  return `${Math.floor(ms / 60000)}m ${((ms % 60000) / 1000).toFixed(0)}s`;
};

const formatMemory = (mb: number): string => {
  if (mb < 1024) {return `${mb.toFixed(0)}MB`;}
  return `${(mb / 1024).toFixed(2)}GB`;
};

const getGradeColor = (grade: string): string => {
  switch (grade) {
    case 'A': return 'success.main';
    case 'B': return 'info.main';
    case 'C': return 'warning.main';
    case 'D': return 'orange.main';
    case 'F': return 'error.main';
    default: return 'text.primary';
  }
};

const getComplexityColor = (complexity: number, theme: Theme): string => {
  if (complexity <= 3) {return theme.palette.success.main;}
  if (complexity <= 6) {return theme.palette.info.main;}
  if (complexity <= 10) {return theme.palette.warning.main;}
  return theme.palette.error.main;
};

interface NodeMetricsItemProps {
  metrics: NodePerformanceMetrics;
  expanded: boolean;
  onToggle: () => void;
}

const NodeMetricsItem: React.FC<NodeMetricsItemProps> = ({ metrics, expanded, onToggle }) => {
  const theme = useTheme();

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.5,
        mb: 1,
        cursor: 'pointer',
        transition: 'all 0.2s',
        '&:hover': { bgcolor: 'action.hover' },
      }}
      onClick={onToggle}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip
            label={metrics.nodeType}
            size="small"
            sx={{
              bgcolor: getComplexityColor(metrics.complexity, theme),
              color: 'white',
              fontWeight: 600,
              fontSize: '0.7rem',
            }}
          />
          <Typography variant="body2" fontWeight={500}>
            {metrics.nodeId.slice(0, 8)}...
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Tooltip title="Estimated runtime">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <TimerIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
              <Typography variant="caption" color="text.secondary">
                {formatDuration(metrics.estimatedRuntime)}
              </Typography>
            </Box>
          </Tooltip>
          <Tooltip title="Memory usage">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <StorageIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
              <Typography variant="caption" color="text.secondary">
                {formatMemory(metrics.memoryUsage)}
              </Typography>
            </Box>
          </Tooltip>
          <IconButton size="small">
            {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        </Box>
      </Box>

      <Collapse in={expanded}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, mt: 1, pt: 1, borderTop: 1, borderColor: 'divider' }}>
          <Box>
            <Typography variant="caption" color="text.secondary">Complexity</Typography>
            <LinearProgress
              variant="determinate"
              value={Math.min((metrics.complexity / 20) * 100, 100)}
              sx={{ height: 4, borderRadius: 2, mt: 0.5 }}
              color={metrics.complexity <= 3 ? 'success' : metrics.complexity <= 6 ? 'info' : metrics.complexity <= 10 ? 'warning' : 'error'}
            />
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Dependencies</Typography>
            <Typography variant="body2" fontWeight={600}>{metrics.dependencies}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Dependents</Typography>
            <Typography variant="body2" fontWeight={600}>{metrics.dependents}</Typography>
          </Box>
        </Box>

        {metrics.suggestions.length > 0 && (
          <Box sx={{ mt: 1.5, p: 1, bgcolor: 'warning.lighter', borderRadius: 1 }}>
            <Typography variant="caption" color="warning.dark" fontWeight={600} display="flex" alignItems="center" gap={0.5}>
              <WarningIcon sx={{ fontSize: 14 }} />
              Optimization Suggestions
            </Typography>
            <List dense sx={{ py: 0 }}>
              {metrics.suggestions.map((suggestion: string, idx: number) => (
                <ListItem key={idx} sx={{ py: 0.25 }}>
                  <ListItemIcon sx={{ minWidth: 20 }}>
                    <TrendingDownIcon sx={{ fontSize: 14, color: 'warning.main' }} />
                  </ListItemIcon>
                  <ListItemText
                    primary={suggestion}
                    primaryTypographyProps={{ variant: 'caption' }}
                  />
                </ListItem>
              ))}
            </List>
          </Box>
        )}
      </Collapse>
    </Paper>
  );
};

export const PerformanceProfiler: React.FC<PerformanceProfilerProps> = ({
  workflowId,
  nodes,
  edges,
  onAnalyze,
}) => {
  const theme = useTheme();
  const { currentProfile, isAnalyzing, lastError, actions } = usePerformanceProfileStore();
  const [expandedNodes, setExpandedNodes] = React.useState<Set<string>>(new Set());

  const handleAnalyze = useCallback(() => {
    const profile = actions.analyzeWorkflow(workflowId, nodes, edges);
    onAnalyze?.(profile);
  }, [workflowId, nodes, edges, actions, onAnalyze]);

  const toggleNodeExpanded = useCallback((nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const sortedMetrics = useMemo(() => {
    if (!currentProfile) {return [];}
    return [...currentProfile.nodeMetrics].sort((a, b) => b.estimatedRuntime - a.estimatedRuntime);
  }, [currentProfile]);

  const hasNodes = nodes.length > 0;

  return (
    <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SpeedIcon color="primary" />
          <Typography variant="h6" fontWeight={600}>
            Performance Profiler
          </Typography>
        </Box>
        {currentProfile && (
          <Chip
            label={`Grade: ${currentProfile.grade}`}
            sx={{
              bgcolor: getGradeColor(currentProfile.grade),
              color: 'white',
              fontWeight: 700,
              fontSize: '1rem',
              px: 1,
            }}
          />
        )}
      </Box>

      {!currentProfile && !isAnalyzing && (
        <Paper
          variant="outlined"
          sx={{
            p: 3,
            textAlign: 'center',
            bgcolor: 'background.default',
          }}
        >
          <SpeedIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
          <Typography variant="body1" color="text.secondary" gutterBottom>
            Analyze your workflow for performance bottlenecks
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Get insights on runtime estimates, memory usage, and optimization suggestions
          </Typography>
          <Button
            variant="contained"
            startIcon={<RefreshIcon />}
            onClick={handleAnalyze}
            disabled={!hasNodes}
          >
            {hasNodes ? 'Analyze Workflow' : 'No nodes to analyze'}
          </Button>
        </Paper>
      )}

      {isAnalyzing && (
        <Box sx={{ p: 2 }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Analyzing workflow performance...
          </Typography>
          <LinearProgress />
        </Box>
      )}

      {lastError && (
        <Paper
          variant="outlined"
          sx={{ p: 2, bgcolor: 'error.lighter', borderColor: 'error.main' }}
        >
          <Typography color="error" variant="body2">
            Analysis failed: {lastError}
          </Typography>
        </Paper>
      )}

      {currentProfile && (
        <>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<RefreshIcon />}
              onClick={handleAnalyze}
              fullWidth
            >
              Re-analyze
            </Button>
          </Box>

          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Optimization Score
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{ flex: 1 }}>
                <LinearProgress
                  variant="determinate"
                  value={currentProfile.optimizationScore}
                  sx={{
                    height: 12,
                    borderRadius: 6,
                    bgcolor: 'grey.200',
                    '& .MuiLinearProgress-bar': {
                      bgcolor: getGradeColor(currentProfile.grade),
                    },
                  }}
                />
              </Box>
              <Typography variant="h5" fontWeight={700} color={getGradeColor(currentProfile.grade)}>
                {currentProfile.optimizationScore}
              </Typography>
            </Box>
          </Paper>

          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5 }}>
            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                <TimelineIcon sx={{ fontSize: 18, color: 'primary.main' }} />
                <Typography variant="caption" color="text.secondary">
                  Estimated Runtime
                </Typography>
              </Box>
              <Typography variant="h6" fontWeight={600}>
                {formatDuration(currentProfile.totalEstimatedRuntime)}
              </Typography>
            </Paper>

            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                <MemoryIcon sx={{ fontSize: 18, color: 'secondary.main' }} />
                <Typography variant="caption" color="text.secondary">
                  Memory Usage
                </Typography>
              </Box>
              <Typography variant="h6" fontWeight={600}>
                {formatMemory(currentProfile.totalMemoryUsage)}
              </Typography>
            </Paper>

            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                <CheckCircleIcon sx={{ fontSize: 18, color: 'success.main' }} />
                <Typography variant="caption" color="text.secondary">
                  Parallel Opportunities
                </Typography>
              </Box>
              <Typography variant="h6" fontWeight={600}>
                {currentProfile.parallelOpportunities}
              </Typography>
            </Paper>

            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                <TrendingUpIcon sx={{ fontSize: 18, color: 'warning.main' }} />
                <Typography variant="caption" color="text.secondary">
                  Critical Path
                </Typography>
              </Box>
              <Typography variant="h6" fontWeight={600}>
                {formatDuration(currentProfile.criticalPathLength)}
              </Typography>
            </Paper>
          </Box>

          {currentProfile.bottlenecks.length > 0 && (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1.5 }}>
                <WarningIcon color="warning" />
                <Typography variant="subtitle2" fontWeight={600}>
                  Top Bottlenecks
                </Typography>
              </Box>
              {currentProfile.bottlenecks.slice(0, 3).map((bottleneck: NodePerformanceMetrics) => (
                <NodeMetricsItem
                  key={bottleneck.nodeId}
                  metrics={bottleneck}
                  expanded={expandedNodes.has(bottleneck.nodeId)}
                  onToggle={() => toggleNodeExpanded(bottleneck.nodeId)}
                />
              ))}
            </Paper>
          )}

          <Paper variant="outlined" sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1.5 }}>
              <InfoIcon color="info" />
              <Typography variant="subtitle2" fontWeight={600}>
                All Nodes ({currentProfile.totalNodes})
              </Typography>
            </Box>
            <List dense sx={{ maxHeight: 300, overflow: 'auto' }}>
              {sortedMetrics.map((metric) => (
                <ListItem key={metric.nodeId} sx={{ px: 0 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <Chip
                      label={metric.nodeType}
                      size="small"
                      sx={{
                        bgcolor: getComplexityColor(metric.complexity, theme),
                        color: 'white',
                        fontWeight: 600,
                        fontSize: '0.65rem',
                        height: 20,
                      }}
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary={metric.nodeId.slice(0, 12)}
                    secondary={`${formatDuration(metric.estimatedRuntime)} • ${formatMemory(metric.memoryUsage)}`}
                    primaryTypographyProps={{ variant: 'body2' }}
                    secondaryTypographyProps={{ variant: 'caption' }}
                  />
                </ListItem>
              ))}
            </List>
          </Paper>
        </>
      )}
    </Box>
  );
};

export default PerformanceProfiler;
