/**
 * TraceControls component for workflow execution trace playback controls.
 *
 * Provides UI controls for playing, pausing, stepping through, and managing
 * the playback of workflow execution traces.
 *
 * @module TraceControls
 */

import React, { useCallback } from 'react';
import {
  Box,
  IconButton,
  Tooltip,
  Typography,
  Select,
  MenuItem,
  FormControl,
  Chip,
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  SkipNext as StepIcon,
  Speed as SpeedIcon,
  RestartAlt as ResetIcon,
  Delete as ClearIcon,
  DirectionsWalk as StepModeIcon,
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import useExecutionTrace from '../../hooks/useExecutionTrace';

export interface TraceControlsProps {
  workflowId: string;
  onClear?: () => void;
}

/**
 * TraceControls component provides playback controls for execution traces.
 *
 * @param props - Component props
 * @returns JSX Element
 *
 * @example
 * ```tsx
 * <TraceControls
 *   workflowId={workflowId}
 *   onClear={() => console.log('Trace cleared')}
 * />
 * ```
 */
const TraceControls: React.FC<TraceControlsProps> = ({
  workflowId,
  onClear,
}) => {
  const theme = useTheme();
  const {
    activeTrace,
    playback,
    _currentEvent,
    completedEvents,
    play,
    pause,
    reset,
    step,
    setPlaybackSpeed,
    toggleStepMode,
    clearTrace,
    hasTrace,
  } = useExecutionTrace(workflowId);

  const handleClear = useCallback(() => {
    clearTrace();
    if (onClear) {
      onClear();
    }
  }, [clearTrace, onClear]);

  const handleSpeedChange = useCallback(
    (event: any) => {
      const speed = event.target.value as number;
      setPlaybackSpeed(speed);
    },
    [setPlaybackSpeed]
  );

  if (!hasTrace) {
    return null;
  }

  const totalEvents = activeTrace?.events.length || 0;
  const progress = totalEvents > 0 ? `${completedEvents.length}/${totalEvents}` : '0/0';

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        padding: theme.spacing(1, 1.5),
        backgroundColor: theme.palette.background.paper,
        borderRadius: theme.spacing(1),
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: theme.shadows[2],
      }}
    >
      {/* Status indicator */}
      <Chip
        size="small"
        label={activeTrace?.isComplete ? 'Completed' : 'Recording'}
        color={activeTrace?.isComplete ? 'success' : 'primary'}
        variant="outlined"
      />

      {/* Progress */}
      <Typography variant="caption" color="text.secondary">
        {progress}
      </Typography>

      <Box sx={{ flex: 1 }} />

      {/* Playback controls */}
      {activeTrace?.isComplete && (
        <>
          {/* Step mode toggle */}
          <Tooltip title="Step mode">
            <IconButton
              size="small"
              onClick={toggleStepMode}
              color={playback.stepMode ? 'primary' : 'default'}
              disabled={playback.isPlaying}
            >
              <StepModeIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          {/* Reset */}
          <Tooltip title="Reset playback">
            <IconButton size="small" onClick={reset} disabled={playback.isPlaying}>
              <ResetIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          {/* Play/Pause */}
          {playback.stepMode ? (
            <Tooltip title="Step forward">
              <IconButton
                size="small"
                onClick={step}
                disabled={playback.currentEventIndex >= totalEvents - 1}
              >
                <StepIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : (
            <Tooltip title={playback.isPlaying ? 'Pause' : 'Play'}>
              <IconButton
                size="small"
                onClick={playback.isPlaying ? pause : play}
                color={playback.isPlaying ? 'primary' : 'default'}
              >
                {playback.isPlaying ? <PauseIcon fontSize="small" /> : <PlayIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          )}

          {/* Playback speed */}
          {!playback.stepMode && (
            <FormControl size="small" sx={{ minWidth: 60, ml: 1 }}>
              <Select
                value={playback.playbackSpeed}
                onChange={handleSpeedChange}
                variant="standard"
                IconComponent={SpeedIcon}
                disabled={playback.isPlaying}
              >
                <MenuItem value={0.5}>0.5x</MenuItem>
                <MenuItem value={1}>1x</MenuItem>
                <MenuItem value={2}>2x</MenuItem>
                <MenuItem value={4}>4x</MenuItem>
              </Select>
            </FormControl>
          )}
        </>
      )}

      {/* Clear trace */}
      <Tooltip title="Clear trace">
        <IconButton size="small" onClick={handleClear} color="error">
          <ClearIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
};

export default TraceControls;
