/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useCallback, useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  IconButton,
  LinearProgress,
  Chip,
  useTheme,
  Tooltip,
} from "@mui/material";
import type { Theme } from "@mui/material/styles";
import {
  Close as CloseIcon,
  Pause as PauseIcon,
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  SkipNext as SkipIcon,
  HourglassEmpty as PendingIcon,
  Folder as FolderIcon,
  Schedule as ScheduleIcon,
  Timer as TimerIcon,
} from "@mui/icons-material";
import { FixedSizeList as VirtualList } from "react-window";
import AutoSizer from "react-virtualized-auto-sizer";
import { useFolderBatchStore, BatchFile, FolderBatchState } from "../../stores/FolderBatchStore";

const styles = (theme: Theme) =>
  css({
    ".MuiDialog-paper": {
      maxWidth: "600px",
      width: "90vw",
      maxHeight: "80vh",
    },
    ".dialog-header": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "8px 16px",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
    },
    ".dialog-content": {
      padding: 0,
      display: "flex",
      flexDirection: "column",
      minHeight: "400px",
    },
    ".progress-section": {
      padding: "16px",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.background.default,
    },
    ".stats-row": {
      display: "flex",
      gap: "16px",
      marginBottom: "12px",
      flexWrap: "wrap",
    },
    ".stat-item": {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      fontSize: "0.875rem",
    },
    ".file-list-container": {
      flex: 1,
      minHeight: 0,
    },
    ".file-item": {
      display: "flex",
      alignItems: "center",
      padding: "8px 16px",
      cursor: "default",
      transition: "background-color 0.2s",
      "&.current": {
        backgroundColor: `${theme.vars.palette.primary.main}20`,
        borderLeft: `3px solid ${theme.vars.palette.primary.main}`,
      },
      "&.completed": {
        backgroundColor: `${theme.vars.palette.success.main}10`,
      },
      "&.failed": {
        backgroundColor: `${theme.vars.palette.error.main}10`,
      },
    },
    ".file-icon": {
      marginRight: "12px",
      display: "flex",
      alignItems: "center",
    },
    ".file-info": {
      flex: 1,
      minWidth: 0,
    },
    ".file-name": {
      fontSize: "0.875rem",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
    ".file-type": {
      fontSize: "0.75rem",
      color: theme.vars.palette.text.secondary,
    },
    ".control-buttons": {
      display: "flex",
      gap: "8px",
    },
    ".control-button": {
      minWidth: "100px",
    },
  });

/**
 * Format milliseconds to a human-readable duration string
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return "< 1s";
  }
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Get icon for file status
 */
function getStatusIcon(status: BatchFile["status"], isCurrent: boolean): React.ReactNode {
  if (isCurrent && status === "running") {
    return (
      <Box
        sx={{
          width: 20,
          height: 20,
          borderRadius: "50%",
          border: "2px solid",
          borderColor: "primary.main",
          borderTopColor: "transparent",
          animation: "spin 1s linear infinite",
          "@keyframes spin": {
            from: { transform: "rotate(0deg)" },
            to: { transform: "rotate(360deg)" },
          },
        }}
      />
    );
  }
  
  switch (status) {
    case "completed":
      return <CheckCircleIcon color="success" fontSize="small" />;
    case "failed":
      return <ErrorIcon color="error" fontSize="small" />;
    case "skipped":
      return <SkipIcon color="disabled" fontSize="small" />;
    case "running":
      return <PendingIcon color="primary" fontSize="small" />;
    default:
      return <PendingIcon color="disabled" fontSize="small" />;
  }
}

/**
 * Get status color for chip
 */
function getStatusColor(state: FolderBatchState): "default" | "primary" | "success" | "warning" | "error" {
  switch (state) {
    case "running":
      return "primary";
    case "paused":
      return "warning";
    case "completed":
      return "success";
    case "stopped":
      return "error";
    default:
      return "default";
  }
}

interface FolderBatchDialogProps {
  open: boolean;
  onClose: () => void;
}

const FolderBatchDialog: React.FC<FolderBatchDialogProps> = memo(function FolderBatchDialog({
  open,
  onClose,
}) {
  const theme = useTheme();
  const listRef = useRef<VirtualList>(null);
  
  const {
    state,
    files,
    currentIndex,
    folderPath,
    pause,
    resume,
    stop,
    reset,
    getElapsedTime,
    getEstimatedTimeRemaining,
    getProgress,
    getCompletedCount,
    getFailedCount,
    getSkippedCount,
  } = useFolderBatchStore();
  
  // Update timer every second
  const [, setTick] = useState(0);
  useEffect(() => {
    if (state === "running") {
      const interval = setInterval(() => setTick((t) => t + 1), 1000);
      return () => clearInterval(interval);
    }
  }, [state]);
  
  // Auto-scroll to current file
  useEffect(() => {
    if (currentIndex >= 0 && listRef.current) {
      listRef.current.scrollToItem(currentIndex, "center");
    }
  }, [currentIndex]);
  
  const handlePauseResume = useCallback(() => {
    if (state === "paused") {
      resume();
    } else if (state === "running") {
      pause();
    }
  }, [state, pause, resume]);
  
  const handleStop = useCallback(() => {
    stop();
  }, [stop]);
  
  const handleClose = useCallback(() => {
    if (state === "running" || state === "paused") {
      // Don't close while running
      return;
    }
    reset();
    onClose();
  }, [state, reset, onClose]);
  
  const elapsed = getElapsedTime();
  const eta = getEstimatedTimeRemaining();
  const progress = getProgress();
  const completed = getCompletedCount();
  const failed = getFailedCount();
  const skipped = getSkippedCount();
  
  const canClose = state !== "running" && state !== "paused";
  const isActive = state === "running" || state === "paused";
  
  const FileRow = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
    const file = files[index];
    const isCurrent = index === currentIndex && isActive;
    
    let className = "file-item";
    if (isCurrent) {
      className += " current";
    }
    if (file.status === "completed") {
      className += " completed";
    }
    if (file.status === "failed") {
      className += " failed";
    }
    
    return (
      <div style={style} className={className}>
        <div className="file-icon">
          {getStatusIcon(file.status, isCurrent)}
        </div>
        <div className="file-info">
          <Typography className="file-name" title={file.name}>
            {file.name}
          </Typography>
          <Typography className="file-type">
            {file.matchedType ? `→ ${file.matchedType}` : "No matching input"}
            {file.processingTime && ` (${formatDuration(file.processingTime)})`}
            {file.error && ` - ${file.error}`}
          </Typography>
        </div>
      </div>
    );
  }, [files, currentIndex, isActive]);
  
  return (
    <Dialog
      open={open}
      onClose={canClose ? handleClose : undefined}
      css={styles(theme)}
      maxWidth="md"
      fullWidth
    >
      <div className="dialog-header">
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <FolderIcon color="primary" />
          <Box>
            <Typography variant="h6" component="span">
              Batch Processing
            </Typography>
            <Chip
              size="small"
              label={state.charAt(0).toUpperCase() + state.slice(1)}
              color={getStatusColor(state)}
              sx={{ ml: 1 }}
            />
          </Box>
        </Box>
        <IconButton onClick={handleClose} disabled={!canClose} size="small">
          <CloseIcon />
        </IconButton>
      </div>
      
      <DialogContent className="dialog-content">
        {/* Progress Section */}
        <div className="progress-section">
          {folderPath && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Folder: {folderPath}
            </Typography>
          )}
          
          <div className="stats-row">
            <div className="stat-item">
              <TimerIcon fontSize="small" color="action" />
              <span>Elapsed: {formatDuration(elapsed)}</span>
            </div>
            {eta !== null && (
              <div className="stat-item">
                <ScheduleIcon fontSize="small" color="action" />
                <span>ETA: {formatDuration(eta)}</span>
              </div>
            )}
            <div className="stat-item">
              <Typography variant="body2">
                Files: {completed + failed + skipped} / {files.length}
              </Typography>
            </div>
          </div>
          
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Box sx={{ flex: 1 }}>
              <LinearProgress
                variant="determinate"
                value={progress}
                sx={{ height: 8, borderRadius: 4 }}
              />
            </Box>
            <Typography variant="body2" sx={{ minWidth: 48 }}>
              {Math.round(progress)}%
            </Typography>
          </Box>
          
          {/* Summary chips */}
          <Box sx={{ display: "flex", gap: 1, mt: 1.5 }}>
            {completed > 0 && (
              <Chip
                size="small"
                icon={<CheckCircleIcon />}
                label={`${completed} completed`}
                color="success"
                variant="outlined"
              />
            )}
            {failed > 0 && (
              <Chip
                size="small"
                icon={<ErrorIcon />}
                label={`${failed} failed`}
                color="error"
                variant="outlined"
              />
            )}
            {skipped > 0 && (
              <Chip
                size="small"
                icon={<SkipIcon />}
                label={`${skipped} skipped`}
                variant="outlined"
              />
            )}
          </Box>
        </div>
        
        {/* File List */}
        <div className="file-list-container">
          <AutoSizer>
            {({ height, width }) => (
              <VirtualList
                ref={listRef}
                height={height}
                width={width}
                itemCount={files.length}
                itemSize={56}
              >
                {FileRow}
              </VirtualList>
            )}
          </AutoSizer>
        </div>
      </DialogContent>
      
      <DialogActions sx={{ padding: 2, borderTop: 1, borderColor: "divider" }}>
        <Box sx={{ flex: 1 }}>
          {state === "completed" && (
            <Typography variant="body2" color="success.main">
              Batch processing complete!
            </Typography>
          )}
          {state === "stopped" && (
            <Typography variant="body2" color="text.secondary">
              Batch processing stopped.
            </Typography>
          )}
        </Box>
        
        <div className="control-buttons">
          {isActive && (
            <>
              <Tooltip title={state === "paused" ? "Resume" : "Pause"}>
                <Button
                  className="control-button"
                  variant="outlined"
                  onClick={handlePauseResume}
                  startIcon={state === "paused" ? <PlayIcon /> : <PauseIcon />}
                >
                  {state === "paused" ? "Resume" : "Pause"}
                </Button>
              </Tooltip>
              <Tooltip title="Stop processing">
                <Button
                  className="control-button"
                  variant="outlined"
                  color="error"
                  onClick={handleStop}
                  startIcon={<StopIcon />}
                >
                  Stop
                </Button>
              </Tooltip>
            </>
          )}
          
          {canClose && (
            <Button
              className="control-button"
              variant="contained"
              onClick={handleClose}
            >
              Close
            </Button>
          )}
        </div>
      </DialogActions>
    </Dialog>
  );
});

export default FolderBatchDialog;
