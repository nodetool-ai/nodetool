/**
 * Workflow Profiler Component
 * 
 * EXPERIMENTAL: This is a research feature for analyzing workflow performance.
 * Displays execution timing, bottlenecks, and optimization suggestions.
 * 
 * @module WorkflowProfiler
 */

import React, { useMemo, useCallback, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  LinearProgress,
  Card,
  CardContent,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Alert,
  Divider,
  Tooltip,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Speed as SpeedIcon,
  Timeline as TimelineIcon,
  Lightbulb as LightbulbIcon,
  Refresh as RefreshIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
} from '@mui/icons-material';
import { useNodes } from '../../contexts/NodeContext';
import {
  analyzeWorkflowPerformance,
  formatDuration,
  WorkflowProfile,
  NodeTiming,
} from './workflowProfilerUtils';

/**
 * Props for the WorkflowProfiler component
 */
interface WorkflowProfilerProps {
  /** The workflow ID to analyze */
  workflowId: string;
  /** Whether to show detailed analysis */
  showDetails?: boolean;
  /** Callback when analysis is complete */
  onAnalysisComplete?: (profile: WorkflowProfile) => void;
}

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
  trend?: 'up' | 'down' | 'neutral';
}

const StatCard: React.FC<StatCardProps> = ({ title, value, subtitle, icon, color, trend }) => (
  <Card sx={{ height: '100%' }}>
    <CardContent>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <Box
          sx={{
            p: 0.75,
            borderRadius: 1,
            bgcolor: `${color}15`,
            color: color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mr: 1,
          }}
        >
          {icon}
        </Box>
        <Typography variant="body2" color="text.secondary">
          {title}
        </Typography>
        {trend && (
          <Tooltip title={`Trend: ${trend}`}>
            <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center' }}>
              {trend === 'up' && <TrendingUpIcon sx={{ fontSize: 16, color: 'success.main' }} />}
              {trend === 'down' && <TrendingDownIcon sx={{ fontSize: 16, color: 'error.main' }} />}
            </Box>
          </Tooltip>
        )}
      </Box>
      <Typography variant="h4" sx={{ fontWeight: 600 }}>
        {value}
      </Typography>
      {subtitle && (
        <Typography variant="caption" color="text.secondary">
          {subtitle}
        </Typography>
      )}
    </CardContent>
  </Card>
);

const NodeTimingRow: React.FC<{ timing: NodeTiming; rank: number }> = ({ timing, rank }) => {
  const duration = timing.duration || 0;
  const maxDuration = 10000;
  const progress = Math.min((duration / maxDuration) * 100, 100);
  
  const getStatusChip = (status: string) => {
    const statusConfig: Record<string, { label: string; color: 'default' | 'success' | 'error' | 'warning' | 'info' }> = {
      completed: { label: 'Completed', color: 'success' },
      running: { label: 'Running', color: 'info' },
      failed: { label: 'Failed', color: 'error' },
      pending: { label: 'Pending', color: 'default' },
      queued: { label: 'Queued', color: 'warning' },
    };
    const config = statusConfig[status.toLowerCase()] || { label: status, color: 'default' as const };
    return <Chip label={config.label} color={config.color} size="small" />;
  };

  return (
    <TableRow hover>
      <TableCell sx={{ width: 40 }}>#{rank}</TableCell>
      <TableCell>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {timing.nodeLabel}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {timing.nodeType}
        </Typography>
      </TableCell>
      <TableCell>{getStatusChip(timing.status)}</TableCell>
      <TableCell sx={{ width: 150 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <LinearProgress
            variant="determinate"
            value={progress}
            sx={{ flex: 1, height: 8, borderRadius: 4 }}
            color={progress > 80 ? 'error' : progress > 50 ? 'warning' : 'primary'}
          />
          <Typography variant="body2" sx={{ minWidth: 60, textAlign: 'right' }}>
            {formatDuration(duration)}
          </Typography>
        </Box>
      </TableCell>
      <TableCell sx={{ width: 80 }}>
        {timing.isParallelizable && (
          <Chip label="Parallel" size="small" variant="outlined" color="info" />
        )}
      </TableCell>
    </TableRow>
  );
};

export const WorkflowProfiler: React.FC<WorkflowProfilerProps> = ({
  workflowId,
  showDetails = true,
  onAnalysisComplete,
}) => {
  const nodes = useNodes((state) => state.nodes);
  const [profile, setProfile] = useState<WorkflowProfile | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    bottlenecks: true,
    parallel: false,
    recommendations: true,
  });

  const runAnalysis = useCallback(async () => {
    setIsAnalyzing(true);
    
    await new Promise((resolve) => setTimeout(resolve, 100));
    
    const result = analyzeWorkflowPerformance(workflowId, nodes);
    setProfile(result);
    setIsAnalyzing(false);
    
    if (onAnalysisComplete) {
      onAnalysisComplete(result);
    }
  }, [workflowId, nodes, onAnalysisComplete]);

  const stats = useMemo(() => {
    if (!profile) { return null; }
    
    const executionProgress = profile.totalNodes > 0
      ? Math.round((profile.executedNodes / profile.totalNodes) * 100)
      : 0;
    
    const parallelizationGain = profile.totalWallTime > 0
      ? Math.round(((profile.totalWallTime - profile.estimatedParallelTime) / profile.totalWallTime) * 100)
      : 0;
    
    return {
      totalNodes: profile.totalNodes,
      executedNodes: profile.executedNodes,
      executionProgress,
      totalWallTime: profile.totalWallTime,
      estimatedParallelTime: profile.estimatedParallelTime,
      parallelizationGain,
      efficiencyScore: Math.round(profile.efficiencyScore * 100),
      bottleneckCount: profile.bottleneckNodes.length,
    };
  }, [profile]);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SpeedIcon color="primary" />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Workflow Performance Profiler
          </Typography>
          <Chip label="Experimental" size="small" color="warning" variant="outlined" />
        </Box>
        <Button
          variant="outlined"
          startIcon={isAnalyzing ? undefined : <RefreshIcon />}
          onClick={runAnalysis}
          disabled={isAnalyzing}
          size="small"
        >
          {isAnalyzing ? 'Analyzing...' : 'Analyze'}
        </Button>
      </Box>

      {isAnalyzing && <LinearProgress sx={{ mb: 2 }} />}

      {!profile && !isAnalyzing && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Click &quot;Analyze&quot; to run a performance analysis on this workflow&apos;s execution data.
        </Alert>
      )}

      {stats && (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 2, mb: 3 }}>
            <StatCard
              title="Total Nodes"
              value={stats.totalNodes}
              subtitle={`${stats.executedNodes} executed`}
              icon={<TimelineIcon />}
              color="#1976d2"
            />
            <StatCard
              title="Total Time"
              value={formatDuration(stats.totalWallTime)}
              subtitle="Wall clock time"
              icon={<SpeedIcon />}
              color="#ed6c02"
            />
            <StatCard
              title="Parallel Time"
              value={formatDuration(stats.estimatedParallelTime)}
              subtitle={`${stats.parallelizationGain}% potential gain`}
              icon={<TrendingUpIcon />}
              color="#2e7d32"
            />
            <StatCard
              title="Efficiency"
              value={`${stats.efficiencyScore}%`}
              subtitle="Parallelization efficiency"
              icon={<SpeedIcon />}
              color={stats.efficiencyScore > 70 ? '#2e7d32' : stats.efficiencyScore > 40 ? '#ed6c02' : '#d32f2f'}
              trend={stats.efficiencyScore > 50 ? 'up' : 'down'}
            />
          </Box>

          {stats.executionProgress < 100 && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Workflow execution is not complete ({stats.executionProgress}%). 
              Full analysis requires all nodes to finish executing.
            </Alert>
          )}

          {showDetails && (
            <>
              <Accordion
                expanded={expandedSections.bottlenecks}
                onChange={() => toggleSection('bottlenecks')}
                sx={{ mb: 1 }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <LightbulbIcon color="warning" fontSize="small" />
                    <Typography fontWeight={500}>Performance Bottlenecks</Typography>
                    <Chip label={profile?.bottleneckNodes.length || 0} size="small" color="warning" />
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  {profile?.bottleneckNodes.length ? (
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Rank</TableCell>
                            <TableCell>Node</TableCell>
                            <TableCell>Status</TableCell>
                            <TableCell>Duration</TableCell>
                            <TableCell>Parallel</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {profile.bottleneckNodes.map((timing, index) => (
                            <NodeTimingRow key={timing.nodeId} timing={timing} rank={index + 1} />
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      No execution data available. Run the workflow first to identify bottlenecks.
                    </Typography>
                  )}
                </AccordionDetails>
              </Accordion>

              <Accordion
                expanded={expandedSections.parallel}
                onChange={() => toggleSection('parallel')}
                sx={{ mb: 1 }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TrendingUpIcon color="success" fontSize="small" />
                    <Typography fontWeight={500}>Parallelizable Nodes</Typography>
                    <Chip label={profile?.parallelizableNodes.length || 0} size="small" color="success" />
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  {profile?.parallelizableNodes.length ? (
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Rank</TableCell>
                            <TableCell>Node</TableCell>
                            <TableCell>Duration</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {profile.parallelizableNodes.map((timing, index) => (
                            <NodeTimingRow key={timing.nodeId} timing={timing} rank={index + 1} />
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      No parallelizable nodes identified.
                    </Typography>
                  )}
                </AccordionDetails>
              </Accordion>

              <Accordion
                expanded={expandedSections.recommendations}
                onChange={() => toggleSection('recommendations')}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <LightbulbIcon color="info" fontSize="small" />
                    <Typography fontWeight={500}>Optimization Recommendations</Typography>
                    <Chip label={profile?.recommendations.length || 0} size="small" color="info" />
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  {profile?.recommendations.length ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {profile.recommendations.map((rec, index) => (
                        <Alert key={index} severity="info" icon={<LightbulbIcon />}>
                          {rec}
                        </Alert>
                      ))}
                    </Box>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      No recommendations available. Good job!
                    </Typography>
                  )}
                </AccordionDetails>
              </Accordion>
            </>
          )}
        </>
      )}

      <Divider sx={{ my: 2 }} />

      <Typography variant="caption" color="text.secondary">
        Experimental feature. Analysis is based on execution timing data collected during workflow runs.
        Results may vary based on system load and model response times.
      </Typography>
    </Box>
  );
};

export default WorkflowProfiler;
