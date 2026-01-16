/** @jsxImportSource @emotion/react */
import { memo } from "react";
import {
  Box,
  Typography,
  Paper,
  LinearProgress,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tooltip,
  IconButton,
  Button,
  Divider,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SpeedIcon from "@mui/icons-material/Speed";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import TimelineIcon from "@mui/icons-material/Timeline";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import CancelIcon from "@mui/icons-material/Cancel";
import RefreshIcon from "@mui/icons-material/Refresh";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import SkipNextIcon from "@mui/icons-material/SkipNext";

import { useWorkflowProfiler } from "../../hooks/useWorkflowProfiler";

interface ProfilerPanelProps {
  workflowId: string;
}

const ProfilerPanel: React.FC<ProfilerPanelProps> = ({ workflowId }) => {
  const theme = useTheme();

  const {
    isProfiling,
    summary,
    bottlenecks,
    criticalPath,
    nodeProfiles,
    startProfiling,
    endProfiling,
    cancelProfiling,
    getPerformanceGrade,
    getOptimizationSuggestions,
    isOnCriticalPath,
    isParallelizable,
  } = useWorkflowProfiler({ workflowId });

  const performanceGrade = getPerformanceGrade();
  const suggestions = getOptimizationSuggestions();

  const getGradeColor = (grade: string) => {
    switch (grade) {
      case 'A': return theme.vars.palette.success.main;
      case 'B': return theme.vars.palette.info.main;
      case 'C': return theme.vars.palette.warning.main;
      case 'D': return theme.vars.palette.orange.main;
      case 'F': return theme.vars.palette.error.main;
      default: return theme.vars.palette.grey[500];
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return theme.vars.palette.error.main;
      case 'high': return theme.vars.palette.warning.main;
      case 'medium': return theme.vars.palette.info.main;
      case 'low': return theme.vars.palette.success.main;
      default: return theme.vars.palette.grey[500];
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) {
      return `${ms}ms`;
    }
    if (ms < 60000) {
      return `${(ms / 1000).toFixed(1)}s`;
    }
    return `${Math.floor(ms / 60000)}m ${((ms % 60000) / 1000).toFixed(0)}s`;
  };

  if (!summary && !isProfiling) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          <SpeedIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Performance Profiler
        </Typography>
        <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="text.secondary" paragraph>
            Run your workflow to collect performance metrics
          </Typography>
          <Button
            variant="contained"
            startIcon={<PlayArrowIcon />}
            onClick={startProfiling}
          >
            Start Profiling
          </Button>
        </Paper>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6">
          <SpeedIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Performance Profiler
        </Typography>
        <Box>
          {isProfiling ? (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Tooltip title="Stop & Save">
                <IconButton size="small" onClick={endProfiling} color="success">
                  <StopIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Cancel">
                <IconButton size="small" onClick={cancelProfiling} color="error">
                  <CancelIcon />
                </IconButton>
              </Tooltip>
            </Box>
          ) : (
            <Tooltip title="Run Again">
              <IconButton size="small" onClick={startProfiling}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>

      {isProfiling && (
        <Box sx={{ mb: 2 }}>
          <LinearProgress />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            Profiling in progress...
          </Typography>
        </Box>
      )}

      {summary && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">
                  Performance Grade
                </Typography>
                <Typography
                  variant="h3"
                  sx={{ color: getGradeColor(performanceGrade), fontWeight: 'bold' }}
                >
                  {performanceGrade}
                </Typography>
              </Box>
              <Box sx={{ textAlign: 'right' }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Total Duration
                </Typography>
                <Typography variant="h5">
                  {formatDuration(summary.totalDuration)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {summary.executedNodes} nodes executed
                </Typography>
              </Box>
            </Box>
          </Paper>

          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <TimelineIcon sx={{ mr: 1 }} />
                <Typography>Execution Summary</Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <List dense>
                <ListItem>
                  <ListItemIcon>
                    <CheckCircleIcon color="success" fontSize="small" />
                  </ListItemIcon>
                  <ListItemText primary="Completed" secondary={`${summary.executedNodes} nodes`} />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <ErrorIcon color="error" fontSize="small" />
                  </ListItemIcon>
                  <ListItemText primary="Failed" secondary={`${summary.failedNodes} nodes`} />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <SkipNextIcon color="disabled" fontSize="small" />
                  </ListItemIcon>
                  <ListItemText primary="Skipped" secondary={`${summary.skippedNodes} nodes`} />
                </ListItem>
              </List>
              <Divider sx={{ my: 1 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', px: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  Avg: {formatDuration(summary.avgNodeDuration)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Min: {formatDuration(summary.minDuration)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Max: {formatDuration(summary.maxDuration)}
                </Typography>
              </Box>
            </AccordionDetails>
          </Accordion>

          {bottlenecks.length > 0 && (
            <Accordion defaultExpanded>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <WarningAmberIcon sx={{ mr: 1, color: 'warning.main' }} />
                  <Typography>Bottlenecks ({bottlenecks.length})</Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <List dense>
                  {bottlenecks.map((bottleneck, index) => (
                    <ListItem key={index} alignItems="flex-start">
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <Chip
                          label={bottleneck.severity}
                          size="small"
                          sx={{
                            height: 20,
                            fontSize: '0.65rem',
                            backgroundColor: getSeverityColor(bottleneck.severity) + '20',
                            color: getSeverityColor(bottleneck.severity),
                          }}
                        />
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body2" noWrap sx={{ maxWidth: 150 }}>
                              {bottleneck.nodeLabel}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {bottleneck.percentageOfTotal.toFixed(1)}%
                            </Typography>
                          </Box>
                        }
                        secondary={bottleneck.suggestion}
                      />
                    </ListItem>
                  ))}
                </List>
              </AccordionDetails>
            </Accordion>
          )}

          {criticalPath.length > 0 && (
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <TrendingDownIcon sx={{ mr: 1 }} />
                  <Typography>Critical Path ({criticalPath.length} nodes)</Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {criticalPath.map((nodeId) => {
                    const profile = nodeProfiles[nodeId];
                    const maxDuration = summary?.maxDuration || 1;
                    const percentage = (profile.duration / maxDuration) * 100;

                    return (
                      <Box key={nodeId} sx={{ mb: 1, width: '100%' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {isOnCriticalPath(nodeId) && (
                              <TrendingDownIcon fontSize="small" color="error" />
                            )}
                            {isParallelizable(nodeId) && (
                              <Tooltip title="Can run in parallel">
                                <Box component="span" sx={{ display: 'flex' }}>
                                  <TimelineIcon fontSize="small" color="info" />
                                </Box>
                              </Tooltip>
                            )}
                            <Typography variant="caption" noWrap sx={{ maxWidth: 150 }}>
                              {profile.nodeLabel}
                            </Typography>
                          </Box>
                          <Typography variant="caption">
                            {formatDuration(profile.duration)}
                          </Typography>
                        </Box>
                        <LinearProgress
                          variant="determinate"
                          value={percentage}
                          sx={{ height: 4, borderRadius: 2 }}
                      color={
                          profile.status === 'completed'
                            ? 'primary'
                            : profile.status === 'failed'
                              ? 'error'
                              : 'inherit'
                        }
                        />
                      </Box>
                    );
                  })}
                </Box>
              </AccordionDetails>
            </Accordion>
          )}

          {suggestions.length > 0 && (
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>Optimization Suggestions</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <List dense>
                  {suggestions.map((suggestion, index) => (
                    <ListItem key={index}>
                      <ListItemText
                        primary={suggestion}
                        primaryTypographyProps={{ variant: 'body2' }}
                      />
                    </ListItem>
                  ))}
                </List>
              </AccordionDetails>
            </Accordion>
          )}

          <Paper variant="outlined" sx={{ p: 2, backgroundColor: 'action.hover' }}>
            <Typography variant="subtitle2" gutterBottom>
              Node Execution Times
            </Typography>
            <Box sx={{ maxHeight: 300, overflow: 'auto' }}>
              {Object.entries(nodeProfiles)
                .sort(([, a], [, b]) => b.duration - a.duration)
                .map(([nodeId, profile]) => {
                  const maxDuration = summary?.maxDuration || 1;
                  const percentage = (profile.duration / maxDuration) * 100;

                  return (
                    <Box key={nodeId} sx={{ mb: 1 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {isOnCriticalPath(nodeId) && (
                            <TrendingDownIcon fontSize="small" color="error" />
                          )}
                          {isParallelizable(nodeId) && (
                            <Tooltip title="Can run in parallel">
                              <Box component="span" sx={{ display: 'flex' }}>
                                <TimelineIcon fontSize="small" color="info" />
                              </Box>
                            </Tooltip>
                          )}
                          <Typography variant="caption" noWrap sx={{ maxWidth: 150 }}>
                            {profile.nodeLabel}
                          </Typography>
                        </Box>
                        <Typography variant="caption">
                          {formatDuration(profile.duration)}
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={percentage}
                        sx={{ height: 4, borderRadius: 2 }}
                        color={
                          profile.status === 'completed'
                            ? 'primary'
                            : profile.status === 'failed'
                              ? 'error'
                              : 'inherit'
                        }
                      />
                    </Box>
                  );
                })}
            </Box>
          </Paper>
        </Box>
      )}
    </Box>
  );
};

export default memo(ProfilerPanel);
