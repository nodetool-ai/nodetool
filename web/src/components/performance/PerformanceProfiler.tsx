import React, { useMemo } from 'react';
import { Box, Paper, Typography, Chip, LinearProgress } from '@mui/material';
import {
  useWorkflowPerformance,
  formatDuration,
  getPerformanceGrade,
  getOptimizationSuggestions,
  WorkflowPerformanceMetrics,
  NodePerformanceData
} from '../../hooks/useWorkflowPerformance';
import { Node } from '@xyflow/react';

interface PerformanceProfilerProps {
  workflowId: string;
  nodes: Node[];
  onNodeClick?: (nodeId: string) => void;
}

export const PerformanceProfiler: React.FC<PerformanceProfilerProps> = ({
  workflowId,
  nodes,
  onNodeClick
}) => {
  const metrics = useWorkflowPerformance(workflowId, nodes);
  const suggestions = useMemo(
    () => getOptimizationSuggestions(metrics, nodes),
    [metrics, nodes]
  );

  if (nodes.length === 0) {
    return (
      <Paper sx={{ p: 2 }}>
        <Typography color="text.secondary">
          No nodes in workflow. Add nodes to see performance metrics.
        </Typography>
      </Paper>
    );
  }

  if (metrics.executedNodes === 0) {
    return (
      <Paper sx={{ p: 2 }}>
        <Typography color="text.secondary">
          Run the workflow to see performance metrics.
        </Typography>
      </Paper>
    );
  }

  return (
    <Box sx={{ p: 2, maxHeight: '100%', overflow: 'auto' }}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        Performance Profiler
      </Typography>
      
      <PerformanceSummary metrics={metrics} />
      
      <PerformanceChart metrics={metrics} nodes={nodes} onNodeClick={onNodeClick} />
      
      <BottleneckList 
        bottlenecks={metrics.bottlenecks} 
        onNodeClick={onNodeClick}
      />
      
      <OptimizationSuggestions suggestions={suggestions} />
    </Box>
  );
};

const PerformanceSummary: React.FC<{ metrics: WorkflowPerformanceMetrics }> = ({ metrics }) => {
  const { grade, color } = getPerformanceGrade(metrics.performanceScore);

  return (
    <Paper sx={{ p: 2, mb: 2, bgcolor: 'background.default' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Box
          sx={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            bgcolor: color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: 'bold',
            fontSize: '1.5rem'
          }}
        >
          {grade}
        </Box>
        <Box>
          <Typography variant="h5">
            {metrics.performanceScore}/100
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Performance Score
          </Typography>
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2 }}>
        <Box>
          <Typography variant="body2" color="text.secondary">
            Total Duration
          </Typography>
          <Typography variant="body1" fontWeight="medium">
            {formatDuration(metrics.totalDuration)}
          </Typography>
        </Box>
        <Box>
          <Typography variant="body2" color="text.secondary">
            Nodes Executed
          </Typography>
          <Typography variant="body1" fontWeight="medium">
            {metrics.executedNodes}/{metrics.totalNodes}
          </Typography>
        </Box>
        <Box>
          <Typography variant="body2" color="text.secondary">
            Average per Node
          </Typography>
          <Typography variant="body1" fontWeight="medium">
            {formatDuration(metrics.averageDuration)}
          </Typography>
        </Box>
        <Box>
          <Typography variant="body2" color="text.secondary">
            Bottlenecks
          </Typography>
          <Typography 
            variant="body1" 
            fontWeight="medium"
            color={metrics.bottleneckCount > 0 ? 'error.main' : 'success.main'}
          >
            {metrics.bottleneckCount}
          </Typography>
        </Box>
      </Box>
    </Paper>
  );
};

const PerformanceChart: React.FC<{
  metrics: WorkflowPerformanceMetrics;
  nodes: Node[];
  onNodeClick?: (nodeId: string) => void;
}> = ({ metrics, nodes, onNodeClick }) => {
  const sortedNodes = useMemo(() => {
    return nodes
      .map(node => {
        const timing = metrics.bottlenecks.find(b => b.nodeId === node.id) || {
          duration: undefined,
          percentage: 0
        };
        return {
          node,
          duration: timing.duration,
          percentage: timing.percentage
        };
      })
      .filter(n => n.duration !== undefined)
      .sort((a, b) => (b.duration || 0) - (a.duration || 0))
      .slice(0, 10);
  }, [nodes, metrics.bottlenecks]);

  if (sortedNodes.length === 0) {
    return null;
  }

  const maxDuration = sortedNodes[0]?.duration || 1;

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Typography variant="subtitle1" sx={{ mb: 1 }}>
        Execution Time by Node (Top 10)
      </Typography>
      <Box sx={{ maxHeight: 300, overflow: 'auto' }}>
        {sortedNodes.map(({ node, duration, percentage }) => (
          <Box 
            key={node.id} 
            sx={{ mb: 1, cursor: onNodeClick ? 'pointer' : 'default' }}
            onClick={() => onNodeClick?.(node.id)}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="body2" noWrap sx={{ maxWidth: '60%' }}>
                {node.data.label?.toString() || node.type}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {formatDuration(duration || 0)} ({percentage.toFixed(1)}%)
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={((duration || 0) / maxDuration) * 100}
              sx={{ 
                height: 8,
                borderRadius: 4,
                bgcolor: 'action.hover',
                '& .MuiLinearProgress-bar': {
                  bgcolor: (duration || 0) >= 3000 ? 'error.main' 
                    : (duration || 0) >= 1000 ? 'warning.main' 
                    : 'primary.main'
                }
              }}
            />
          </Box>
        ))}
      </Box>
    </Paper>
  );
};

const BottleneckList: React.FC<{
  bottlenecks: NodePerformanceData[];
  onNodeClick?: (nodeId: string) => void;
}> = ({ bottlenecks, onNodeClick }) => {
  if (bottlenecks.length === 0) {
    return null;
  }

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Typography variant="subtitle1" sx={{ mb: 1 }}>
        Bottlenecks (&gt;1s)
      </Typography>
      {bottlenecks.map(bottleneck => (
        <Box
          key={bottleneck.nodeId}
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            py: 1,
            borderBottom: '1px solid',
            borderColor: 'divider',
            cursor: onNodeClick ? 'pointer' : 'default'
          }}
          onClick={() => onNodeClick?.(bottleneck.nodeId)}
        >
          <Box>
            <Typography variant="body2" fontWeight="medium">
              {bottleneck.nodeLabel}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {bottleneck.nodeType}
            </Typography>
          </Box>
          <Chip 
            label={formatDuration(bottleneck.duration || 0)} 
            color="error" 
            size="small"
          />
        </Box>
      ))}
    </Paper>
  );
};

const OptimizationSuggestions: React.FC<{ suggestions: string[] }> = ({ suggestions }) => {
  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="subtitle1" sx={{ mb: 1 }}>
        Optimization Suggestions
      </Typography>
      <Box component="ul" sx={{ m: 0, pl: 2 }}>
        {suggestions.map((suggestion, index) => (
          <li key={index}>
            <Typography variant="body2" color="text.secondary">
              {suggestion}
            </Typography>
          </li>
        ))}
      </Box>
    </Paper>
  );
};

export default PerformanceProfiler;
