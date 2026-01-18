import React, { useMemo, useCallback, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Chip,
  Collapse,
  Tooltip,
  CircularProgress,
  Alert,
  ListItemButton,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  TrendingUp as TrendingUpIcon,
  Lightbulb as LightbulbIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Refresh as RefreshIcon,
  Timeline as TimelineIcon,
  AccountTree as AccountTreeIcon,
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import useExecutionTimeStore from '../../stores/ExecutionTimeStore';
import useMetadataStore from '../../stores/MetadataStore';
import { useNodes } from '../../contexts/NodeContext';
import { Edge } from '@xyflow/react';

interface PatternDetectorProps {
  workflowId: string;
}

interface WorkflowPattern {
  id: string;
  name: string;
  description: string;
  category: 'structure' | 'performance' | 'best-practice' | 'optimization';
  severity: 'info' | 'warning' | 'suggestion';
  nodes: string[];
  recommendation?: string;
}

interface OptimizationSuggestion {
  id: string;
  title: string;
  description: string;
  potentialGain: string;
  complexity: 'low' | 'medium' | 'high';
  relatedPatterns: string[];
}

interface ExecutionTiming {
  startTime: number;
  endTime?: number;
}

export const WorkflowPatternDetector: React.FC<PatternDetectorProps> = ({
  workflowId,
}) => {
  const theme = useTheme();

  const nodes = useNodes(state => state.nodes);
  const edges = useNodes(state => state.edges);
  const metadataMap = useMetadataStore(state => state.metadata);
  const timings = useExecutionTimeStore(state => state.timings);

  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    structure: true,
    performance: true,
    'best-practice': false,
    optimization: false,
  });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastAnalysisTime, setLastAnalysisTime] = useState<Date | null>(null);

  const patterns = useMemo((): WorkflowPattern[] => {
    const detectedPatterns: WorkflowPattern[] = [];
    const workflowTimings = timings[workflowId] || {};

    const nodeById = new Map(nodes.map(n => [n.id, n]));
    const nodesByType = new Map<string, string[]>();

    nodes.forEach(node => {
      const type = String((node.data as Record<string, unknown>).originalType || node.type || '');
      const existing = nodesByType.get(type) || [];
      nodesByType.set(type, [...existing, node.id]);
    });

    nodes.forEach((node, idx) => {
      if (idx < nodes.length - 1) {
        const nextNode = nodes[idx + 1];
        const hasDirectConnection = edges.some(
          (edge: Edge) => edge.source === node.id && edge.target === nextNode.id
        );

        if (hasDirectConnection) {
          const nodeTitle = String((node.data as Record<string, unknown>).title || node.type || '');
          const nextTitle = String((nextNode.data as Record<string, unknown>).title || nextNode.type || '');

          detectedPatterns.push({
            id: `sequential-${node.id}-${nextNode.id}`,
            name: 'Sequential Processing',
            description: `Nodes "${nodeTitle}" and "${nextTitle}" are connected sequentially`,
            category: 'structure',
            severity: 'info',
            nodes: [node.id, nextNode.id],
            recommendation: 'Consider if these operations can be parallelized or combined',
          });
        }
      }
    });

    nodesByType.forEach((nodeIds, type) => {
      if (nodeIds.length > 1) {
        const nodeType = metadataMap[type]?.title || type;
        detectedPatterns.push({
          id: `multiple-${type}`,
          name: 'Multiple Similar Nodes',
          description: `${nodeIds.length} nodes of type "${nodeType}" detected`,
          category: 'structure',
          severity: 'info',
          nodes: nodeIds,
          recommendation: `Consider consolidating multiple "${nodeType}" nodes into a loop or batch processing pattern`,
        });
      }
    });

    Object.entries(workflowTimings).forEach(([key, timing]) => {
      const [_, nodeId] = key.split(':');
      const typedTiming = timing as ExecutionTiming;
      if (typedTiming.endTime && typedTiming.startTime) {
        const duration = typedTiming.endTime - typedTiming.startTime;
        if (duration > 10000) {
          const node = nodeById.get(nodeId);
          if (node) {
            const nodeTitle = String((node.data as Record<string, unknown>).title || node.type || '');
            detectedPatterns.push({
              id: `slow-${nodeId}`,
              name: 'Long Execution Time',
              description: `Node "${nodeTitle}" took ${(duration / 1000).toFixed(1)}s to execute`,
              category: 'performance',
              severity: 'warning',
              nodes: [nodeId],
              recommendation: 'Consider optimizing this node or using a smaller model',
            });
          }
        }
      }
    });

    const connectedNodes = new Set([
      ...edges.map((e: Edge) => e.source),
      ...edges.map((e: Edge) => e.target),
    ]);

    nodes.forEach(node => {
      const nodeTitle = String((node.data as Record<string, unknown>).title || node.type || '');

      if (!connectedNodes.has(node.id) && node.type !== 'input' && node.type !== 'output') {
        detectedPatterns.push({
          id: `unconnected-${node.id}`,
          name: 'Unconnected Node',
          description: `Node "${nodeTitle}" has no connections`,
          category: 'structure',
          severity: 'warning',
          nodes: [node.id],
          recommendation: 'Connect this node to the workflow or remove it',
        });
      }
    });

    const hasPreview = nodes.some(n =>
      String((n.data as Record<string, unknown>).originalType || n.type || '').includes('Preview')
    );

    if (!hasPreview && nodes.length > 0) {
      detectedPatterns.push({
        id: 'no-preview',
        name: 'No Preview Node',
        description: 'Workflow has no Preview node to visualize outputs',
        category: 'best-practice',
        severity: 'suggestion',
        nodes: [],
        recommendation: 'Add a Preview node to see intermediate results',
      });
    }

    const depthMap = new Map<string, number>();
    const calculateDepth = (nodeId: string): number => {
      if (depthMap.has(nodeId)) {
        return depthMap.get(nodeId)!;
      }
      const incomingEdges = edges.filter((e: Edge) => e.target === nodeId);
      if (incomingEdges.length === 0) {
        depthMap.set(nodeId, 1);
        return 1;
      }
      const maxDepth = Math.max(...incomingEdges.map((e: Edge) => calculateDepth(e.source)));
      depthMap.set(nodeId, maxDepth + 1);
      return maxDepth + 1;
    };

    nodes.forEach(node => calculateDepth(node.id));
    const maxDepth = Math.max(...Array.from(depthMap.values()));

    if (maxDepth > 10) {
      detectedPatterns.push({
        id: 'deep-nesting',
        name: 'Deep Nesting',
        description: `Maximum dependency chain depth is ${maxDepth} nodes`,
        category: 'performance',
        severity: 'info',
        nodes: [],
        recommendation: 'Consider breaking into sub-workflows for better organization',
      });
    }

    const sourceEdges = edges.filter((e: Edge) => {
      const sourceNode = nodes.find(n => n.id === e.source);
      return sourceNode && sourceNode.type === 'input';
    });

    if (sourceEdges.length > 3) {
      detectedPatterns.push({
        id: 'complex-branching',
        name: 'Complex Branching',
        description: `Workflow has ${sourceEdges.length} branches from source nodes`,
        category: 'structure',
        severity: 'info',
        nodes: sourceEdges.map((e: Edge) => e.source),
        recommendation: 'Consider using a Router node for complex branching logic',
      });
    }

    return detectedPatterns;
  }, [nodes, edges, metadataMap, timings, workflowId]);

  const suggestions = useMemo((): OptimizationSuggestion[] => {
    const workflowTimings = timings[workflowId] || {};
    const slowNodes = Object.entries(workflowTimings)
      .filter(([_, t]) => {
        const typedTiming = t as ExecutionTiming;
        return typedTiming.endTime && typedTiming.startTime && (typedTiming.endTime - typedTiming.startTime) > 5000;
      })
      .map(([key]) => {
        const [_, nodeId] = key.split(':');
        return nodeId;
      });

    const connectedNodes = new Set([
      ...edges.map((e: Edge) => e.source),
      ...edges.map((e: Edge) => e.target),
    ]);
    const unconnectedNodes = nodes.filter(n => !connectedNodes.has(n.id));

    const nodesByType = new Map<string, string[]>();
    nodes.forEach(node => {
      const type = String((node.data as Record<string, unknown>).originalType || node.type || '');
      const existing = nodesByType.get(type) || [];
      nodesByType.set(type, [...existing, node.id]);
    });

    const suggestionsList: OptimizationSuggestion[] = [];

    if (slowNodes.length > 0) {
      suggestionsList.push({
        id: 'optimize-slow-nodes',
        title: 'Optimize Slow Nodes',
        description: `${slowNodes.length} node(s) took over 5 seconds to execute. Consider using smaller models or caching.`,
        potentialGain: '50-80% faster execution',
        complexity: 'medium',
        relatedPatterns: slowNodes.map(id => `slow-${id}`),
      });
    }

    if (unconnectedNodes.length > 0) {
      suggestionsList.push({
        id: 'remove-unconnected',
        title: 'Remove Unconnected Nodes',
        description: `${unconnectedNodes.length} node(s) are not connected to the workflow.`,
        potentialGain: 'Cleaner workflow, easier maintenance',
        complexity: 'low',
        relatedPatterns: unconnectedNodes.map(n => `unconnected-${n.id}`),
      });
    }

    nodesByType.forEach((nodeIds, type) => {
      if (nodeIds.length >= 3) {
        const nodeType = metadataMap[type]?.title || type;
        suggestionsList.push({
          id: `consolidate-${type}`,
          title: `Consolidate ${nodeType} Nodes`,
          description: `${nodeIds.length} nodes of type "${nodeType}" could potentially be consolidated.`,
          potentialGain: '10-30% faster execution, easier maintenance',
          complexity: 'medium',
          relatedPatterns: [`multiple-${type}`],
        });
      }
    });

    const hasPreview = nodes.some(n =>
      String((n.data as Record<string, unknown>).originalType || n.type || '').includes('Preview')
    );

    if (!hasPreview && nodes.length > 0) {
      suggestionsList.push({
        id: 'add-preview',
        title: 'Add Preview Node',
        description: 'Add a Preview node to visualize workflow outputs.',
        potentialGain: 'Better debugging and iteration speed',
        complexity: 'low',
        relatedPatterns: ['no-preview'],
      });
    }

    return suggestionsList;
  }, [nodes, edges, timings, metadataMap, workflowId]);

  const handleAnalyze = useCallback(() => {
    setIsAnalyzing(true);
    setTimeout(() => {
      setIsAnalyzing(false);
      setLastAnalysisTime(new Date());
    }, 1000);
  }, []);

  const toggleCategory = useCallback((category: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category],
    }));
  }, []);

  const getSeverityIcon = (severity: WorkflowPattern['severity']) => {
    switch (severity) {
      case 'warning':
        return <WarningIcon sx={{ color: theme.palette.warning.main }} />;
      case 'suggestion':
        return <LightbulbIcon sx={{ color: theme.palette.info.main }} />;
      default:
        return <CheckCircleIcon sx={{ color: theme.palette.info.main }} />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'performance':
        return theme.palette.warning.main;
      case 'structure':
        return theme.palette.info.main;
      case 'optimization':
        return theme.palette.success.main;
      default:
        return theme.palette.grey[500];
    }
  };

  const groupedPatterns = useMemo(() => {
    const groups: Record<string, WorkflowPattern[]> = {
      structure: [],
      performance: [],
      'best-practice': [],
      optimization: [],
    };
    patterns.forEach(pattern => {
      if (groups[pattern.category]) {
        groups[pattern.category].push(pattern);
      }
    });
    return groups;
  }, [patterns]);

  const totalIssues = patterns.filter(p => p.severity === 'warning').length;
  const totalSuggestions = patterns.filter(p => p.severity === 'suggestion').length;

  if (nodes.length === 0) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="info">
          No workflow detected. Add nodes to analyze patterns.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TimelineIcon />
          Workflow Analysis
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {lastAnalysisTime && (
            <Typography variant="caption" color="text.secondary">
              Last: {lastAnalysisTime.toLocaleTimeString()}
            </Typography>
          )}
          <Tooltip title="Re-analyze">
            <IconButton onClick={handleAnalyze} disabled={isAnalyzing} size="small">
              {isAnalyzing ? (
                <CircularProgress size={20} />
              ) : (
                <RefreshIcon />
              )}
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <Chip
          icon={<WarningIcon />}
          label={`${totalIssues} Issues`}
          color="warning"
          size="small"
        />
        <Chip
          icon={<LightbulbIcon />}
          label={`${totalSuggestions} Suggestions`}
          color="info"
          size="small"
        />
      </Box>

      <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
        Patterns Detected
      </Typography>
      <Paper variant="outlined" sx={{ mb: 2 }}>
        {Object.entries(groupedPatterns).map(([category, categoryPatterns]) => (
          <Box key={category}>
            <ListItemButton
              onClick={() => toggleCategory(category)}
              sx={{
                borderBottom: categoryPatterns.length > 0 ? `1px solid ${theme.palette.divider}` : 'none',
              }}
            >
              <ListItemIcon>
                <AccountTreeIcon sx={{ color: getCategoryColor(category) }} />
              </ListItemIcon>
              <ListItemText
                primary={category.charAt(0).toUpperCase() + category.slice(1).replace('-', ' ')}
                secondary={`${categoryPatterns.length} pattern(s) detected`}
              />
              {expandedCategories[category] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </ListItemButton>
            <Collapse in={expandedCategories[category]}>
              <List dense>
                {categoryPatterns.map(pattern => (
                  <ListItem key={pattern.id} sx={{ pl: 4 }}>
                    <ListItemIcon>
                      {getSeverityIcon(pattern.severity)}
                    </ListItemIcon>
                    <ListItemText
                      primary={pattern.name}
                      secondary={
                        <>
                          <Typography variant="body2" component="span">
                            {pattern.description}
                          </Typography>
                          {pattern.recommendation && (
                            <Typography
                              variant="caption"
                              component="p"
                              sx={{ color: theme.palette.text.secondary, mt: 0.5 }}
                            >
                              {pattern.recommendation}
                            </Typography>
                          )}
                        </>
                      }
                    />
                  </ListItem>
                ))}
                {categoryPatterns.length === 0 && (
                  <ListItem sx={{ pl: 4 }}>
                    <ListItemText
                      secondary="No patterns detected in this category"
                      sx={{ color: theme.palette.text.secondary }}
                    />
                  </ListItem>
                )}
              </List>
            </Collapse>
          </Box>
        ))}
      </Paper>

      <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
        Optimization Suggestions
      </Typography>
      {suggestions.length > 0 ? (
        <Paper variant="outlined">
          <List dense>
            {suggestions.map(suggestion => (
              <ListItem key={suggestion.id}>
                <ListItemIcon>
                  <TrendingUpIcon sx={{ color: theme.palette.success.main }} />
                </ListItemIcon>
                <ListItemText
                  primary={suggestion.title}
                  secondary={
                    <>
                      <Typography variant="body2">{suggestion.description}</Typography>
                      <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                        <Chip
                          label={`Gain: ${suggestion.potentialGain}`}
                          size="small"
                          sx={{ fontSize: '0.7rem' }}
                        />
                        <Chip
                          label={`Complexity: ${suggestion.complexity}`}
                          size="small"
                          color={
                            suggestion.complexity === 'low' ? 'success' :
                            suggestion.complexity === 'medium' ? 'warning' : 'error'
                          }
                          sx={{ fontSize: '0.7rem' }}
                        />
                      </Box>
                    </>
                  }
                />
              </ListItem>
            ))}
          </List>
        </Paper>
      ) : (
        <Alert severity="success">
          No optimization suggestions. Your workflow looks well-optimized!
        </Alert>
      )}
    </Box>
  );
};

export default WorkflowPatternDetector;
