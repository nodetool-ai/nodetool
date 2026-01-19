/**
 * Workflow Performance Profiler
 * 
 * Analyzes workflows to identify performance bottlenecks and optimization opportunities.
 * 
 * @experimental
 * This feature is a research prototype. API may change.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Box, Paper, Typography, Button, Chip, List, ListItem, ListItemIcon, ListItemText, CircularProgress, Alert, Tooltip, LinearProgress } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import SpeedIcon from '@mui/icons-material/Speed';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import InfoIcon from '@mui/icons-material/Info';
import RefreshIcon from '@mui/icons-material/Refresh';

export interface PerformanceMetrics {
  estimatedRuntime: number;
  nodeCount: number;
  connectionCount: number;
  parallelizableNodes: number[];
  bottlenecks: Bottleneck[];
  optimizationTips: string[];
  complexityScore: number;
}

export interface Bottleneck {
  nodeId: string;
  nodeType: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  suggestion: string;
}

export interface WorkflowNode {
  id: string;
  type: string;
  data?: Record<string, unknown>;
}

export interface WorkflowEdge {
  source: string;
  target: string;
}

interface WorkflowProfilerProps {
  workflowId: string;
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
  onAnalyzeComplete?: (metrics: PerformanceMetrics) => void;
}

const estimateNodeRuntime = (nodeType: string, nodeData: Record<string, unknown>): number => {
  const baseRuntimes: Record<string, number> = {
    'TextInput': 10,
    'ImageInput': 50,
    'AudioInput': 100,
    'LLM': 2000,
    'ImageGeneration': 3000,
    'AudioGeneration': 5000,
    'TextProcessing': 100,
    'ImageProcessing': 500,
    'Filter': 50,
    'Router': 10,
    'Preview': 20,
  };
  
  const base = baseRuntimes[nodeType] || 100;
  
  if (nodeType === 'LLM' && nodeData && typeof nodeData === 'object') {
    const modelSize = (nodeData as Record<string, unknown>).modelSize as string;
    if (modelSize === 'large') {
      return base * 2;
    }
    if (modelSize === 'medium') {
      return base * 1.5;
    }
  }
  
  if (nodeType === 'ImageProcessing') {
    const size = (nodeData as Record<string, unknown>).size as string;
    if (size === 'large') {
      return base * 2;
    }
  }
  
  return base;
};

export const calculateComplexityScore = (metrics: PerformanceMetrics): number => {
  let score = 0;
  score += metrics.nodeCount * 2;
  score += metrics.connectionCount;
  score += metrics.bottlenecks.length * 10;
  score += Math.log2(metrics.estimatedRuntime) * 5;
  return Math.min(100, score);
};

export const analyzeWorkflow = (
  nodes: WorkflowNode[], 
  edges: WorkflowEdge[]
): PerformanceMetrics => {
  const nodeCount = nodes.length;
  const connectionCount = edges.length;
  
  const parallelizableNodes: number[] = [];
  const bottlenecks: Bottleneck[] = [];
  
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();
  
  nodes.forEach(n => {
    inDegree.set(n.id, 0);
    outDegree.set(n.id, 0);
  });
  
  edges.forEach(e => {
    inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
    outDegree.set(e.source, (outDegree.get(e.source) || 0) + 1);
  });
  
  let totalRuntime = 0;
  const nodeRuntimes = new Map<string, number>();
  
  nodes.forEach(node => {
    const runtime = estimateNodeRuntime(node.type, node.data || {});
    nodeRuntimes.set(node.id, runtime);
    totalRuntime += runtime;
  });
  
  const topologicalOrder: string[] = [];
  const queue = nodes.filter(n => (inDegree.get(n.id) || 0) === 0).map(n => n.id);
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    topologicalOrder.push(current);
    
    edges.filter(e => e.source === current).forEach(e => {
      const newInDegree = (inDegree.get(e.target) || 0) - 1;
      inDegree.set(e.target, newInDegree);
      if (newInDegree === 0) {
        queue.push(e.target);
      }
    });
  }
  
  const levelNodes: string[][] = [];
  const nodeLevels = new Map<string, number>();
  
  nodes.forEach(n => nodeLevels.set(n.id, 0));
  
  edges.forEach(e => {
    const sourceLevel = nodeLevels.get(e.source) || 0;
    const targetLevel = (nodeLevels.get(e.target) || 0);
    if (sourceLevel + 1 > targetLevel) {
      nodeLevels.set(e.target, sourceLevel + 1);
    }
  });
  
  const levelValues = Array.from(nodeLevels.values());
  const maxLevel = levelValues.length > 0 ? Math.max(...levelValues) : 0;
  for (let i = 0; i <= maxLevel; i++) {
    levelNodes[i] = nodes.filter(n => nodeLevels.get(n.id) === i).map(n => n.id);
  }
  
  let estimatedSequentialRuntime = 0;
  for (let i = 0; i <= maxLevel; i++) {
    const levelRuntime = levelNodes[i]
      ?.reduce((sum, id) => sum + (nodeRuntimes.get(id) || 0), 0) || 0;
    estimatedSequentialRuntime += levelRuntime;
    
    if (levelNodes[i] && levelNodes[i].length > 1) {
      parallelizableNodes.push(...levelNodes[i].map(() => Math.random()));
    }
  }
  
  const parallelizationGain = estimatedSequentialRuntime > 0 
    ? ((estimatedSequentialRuntime - totalRuntime) / estimatedSequentialRuntime * 100).toFixed(1)
    : '0';
  
  nodes.forEach(node => {
    const runtime = nodeRuntimes.get(node.id) || 0;
    const percentOfTotal = totalRuntime > 0 ? (runtime / totalRuntime * 100).toFixed(1) : '0';
    
    if (runtime > 2000) {
      bottlenecks.push({
        nodeId: node.id,
        nodeType: node.type,
        severity: runtime > 4000 ? 'high' : 'medium',
        description: `High runtime: ${runtime}ms (${percentOfTotal}% of total)`,
        suggestion: 'Consider using a smaller model or caching results'
      });
    }
    
    if (outDegree.get(node.id) === 0 && node.type !== 'Preview' && node.type !== 'Output') {
      bottlenecks.push({
        nodeId: node.id,
        nodeType: node.type,
        severity: 'low',
        description: 'Node output not connected to any consumer',
        suggestion: 'Connect to Preview or another consumer node'
      });
    }
    
    if ((inDegree.get(node.id) || 0) > 3) {
      bottlenecks.push({
        nodeId: node.id,
        nodeType: node.type,
        severity: 'low',
        description: `High fan-in: ${inDegree.get(node.id)} inputs`,
        suggestion: 'Consider adding an aggregator node to reduce complexity'
      });
    }
  });
  
  const optimizationTips: string[] = [];
  
  if (parseFloat(parallelizationGain) > 20) {
    optimizationTips.push(`Good parallelization: ${parallelizationGain}% of work can run in parallel`);
  }
  
  if (nodeCount > 20) {
    optimizationTips.push('Consider grouping related nodes into sub-workflows for better organization');
  }
  
  const llmNodes = nodes.filter(n => n.type === 'LLM');
  if (llmNodes.length > 2) {
    optimizationTips.push('Multiple LLM nodes detected. Consider caching repeated prompts or using a single model');
  }
  
  const processingNodes = nodes.filter(n => 
    n.type.includes('Processing') || n.type.includes('Generation')
  );
  if (processingNodes.length > 5) {
    optimizationTips.push('Consider using batch processing for multiple media operations');
  }
  
  const complexityScore = calculateComplexityScore({
    estimatedRuntime: totalRuntime,
    nodeCount,
    connectionCount,
    parallelizableNodes,
    bottlenecks,
    optimizationTips,
    complexityScore: 0
  });
  
  return {
    estimatedRuntime: totalRuntime,
    nodeCount,
    connectionCount,
    parallelizableNodes,
    bottlenecks,
    optimizationTips,
    complexityScore
  };
};

const SeverityChip: React.FC<{ severity: 'high' | 'medium' | 'low' }> = ({ severity }) => {
  const colors = {
    high: { bg: '#ffebee', text: '#c62828' },
    medium: { bg: '#fff3e0', text: '#ef6c00' },
    low: { bg: '#e8f5e9', text: '#2e7d32' }
  };
  
  return (
    <Chip 
      size="small" 
      label={severity.toUpperCase()} 
      sx={{ 
        backgroundColor: colors[severity].bg,
        color: colors[severity].text,
        fontWeight: 'bold',
        fontSize: '0.7rem'
      }}
    />
  );
};

export const WorkflowProfiler: React.FC<WorkflowProfilerProps> = ({
  _workflowId,
  nodes = [],
  edges = [],
  onAnalyzeComplete
}) => {
  const theme = useTheme();
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [lastAnalyzed, setLastAnalyzed] = useState<Date | null>(null);
  
  const handleAnalyze = useCallback(async () => {
    setIsAnalyzing(true);
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const result = analyzeWorkflow(nodes, edges);
    setMetrics(result);
    setLastAnalyzed(new Date());
    setIsAnalyzing(false);
    
    if (onAnalyzeComplete) {
      onAnalyzeComplete(result);
    }
  }, [nodes, edges, onAnalyzeComplete]);
  
  const metricsMemo = useMemo(() => metrics, [metrics]);
  
  const complexityColor = useMemo(() => {
    if (!metrics) {
      return theme.palette.text.primary;
    }
    if (metrics.complexityScore > 70) {
      return theme.palette.error.main;
    }
    if (metrics.complexityScore > 40) {
      return theme.palette.warning.main;
    }
    return theme.palette.success.main;
  }, [metrics, theme]);
  
  return (
    <Paper sx={{ p: 2, backgroundColor: theme.palette.background.paper }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <SpeedIcon color="primary" />
        <Typography variant="h6">Workflow Performance Profiler</Typography>
        <Tooltip title="Analyzes workflow for performance bottlenecks and optimization opportunities">
          <InfoIcon sx={{ fontSize: 16, color: theme.palette.text.secondary }} />
        </Tooltip>
      </Box>
      
      <Alert severity="info" sx={{ mb: 2 }}>
        This tool analyzes your workflow structure to identify performance bottlenecks and suggest optimizations.
      </Alert>
      
      <Button 
        variant="contained" 
        onClick={handleAnalyze}
        disabled={isAnalyzing || nodes.length === 0}
        startIcon={isAnalyzing ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
        sx={{ mb: 2 }}
      >
        {isAnalyzing ? 'Analyzing...' : 'Analyze Performance'}
      </Button>
      
      {isAnalyzing && <LinearProgress sx={{ mb: 2 }} />}
      
      {metricsMemo && (
        <Box>
          <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
            <Paper sx={{ p: 2, minWidth: 150, backgroundColor: theme.palette.action.hover }}>
              <Typography variant="caption" color="textSecondary">Estimated Runtime</Typography>
              <Typography variant="h5" color="primary">
                {metricsMemo.estimatedRuntime < 1000 
                  ? `${metricsMemo.estimatedRuntime}ms` 
                  : `${(metricsMemo.estimatedRuntime / 1000).toFixed(1)}s`
                }
              </Typography>
            </Paper>
            
            <Paper sx={{ p: 2, minWidth: 150, backgroundColor: theme.palette.action.hover }}>
              <Typography variant="caption" color="textSecondary">Nodes</Typography>
              <Typography variant="h5">{metricsMemo.nodeCount}</Typography>
            </Paper>
            
            <Paper sx={{ p: 2, minWidth: 150, backgroundColor: theme.palette.action.hover }}>
              <Typography variant="caption" color="textSecondary">Connections</Typography>
              <Typography variant="h5">{metricsMemo.connectionCount}</Typography>
            </Paper>
            
            <Paper sx={{ p: 2, minWidth: 150, backgroundColor: theme.palette.action.hover }}>
              <Typography variant="caption" color="textSecondary">Complexity Score</Typography>
              <Typography variant="h5" sx={{ color: complexityColor }}>
                {metricsMemo.complexityScore}/100
              </Typography>
            </Paper>
          </Box>
          
          {metricsMemo.bottlenecks.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle1" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <WarningAmberIcon color="warning" />
                Bottlenecks ({metricsMemo.bottlenecks.length})
              </Typography>
              
              <List dense>
                {metricsMemo.bottlenecks.map((bottleneck, index) => (
                  <ListItem key={index} sx={{ 
                    backgroundColor: theme.palette.background.default,
                    borderRadius: 1,
                    mb: 0.5
                  }}>
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <SeverityChip severity={bottleneck.severity} />
                    </ListItemIcon>
                    <ListItemText
                      primary={`${bottleneck.nodeType} (${bottleneck.nodeId})`}
                      secondary={
                        <>
                          <Typography variant="body2" component="span">
                            {bottleneck.description}
                          </Typography>
                          <br />
                          <Typography variant="body2" component="span" color="primary">
                            💡 {bottleneck.suggestion}
                          </Typography>
                        </>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
          )}
          
          {metricsMemo.optimizationTips.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle1" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <TrendingUpIcon color="success" />
                Optimization Tips
              </Typography>
              
              <List dense>
                {metricsMemo.optimizationTips.map((tip, index) => (
                  <ListItem key={index}>
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <CheckCircleIcon color="success" fontSize="small" />
                    </ListItemIcon>
                    <ListItemText primary={tip} />
                  </ListItem>
                ))}
              </List>
            </Box>
          )}
          
          {lastAnalyzed && (
            <Typography variant="caption" color="textSecondary">
              Last analyzed: {lastAnalyzed.toLocaleTimeString()}
            </Typography>
          )}
        </Box>
      )}
      
      {!metrics && !isAnalyzing && (
        <Typography color="textSecondary">
          Click &quot;Analyze Performance&quot; to examine this workflow for bottlenecks and optimization opportunities.
        </Typography>
      )}
    </Paper>
  );
};

export default WorkflowProfiler;
